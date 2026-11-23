import "server-only";
import { limitedInviteLookup, type InviteOutcome } from "@/domain/group-invite";
import { isUuid } from "@/domain/groups";
import type { GroupInvitePreview } from "@/lib/groups-contract";
import * as rpc from "@/lib/groups-rpc";
import type { GroupsClient } from "@/lib/groups-rpc";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Invitation lookups. The preview function and the limiter are service-role only (migration 0024), so this is the one
 * server-only module that holds the service client for them; the key never reaches a client component. `viewerId` is the
 * signed-in person's id from the session, never from the request. Wrong guesses are counted, valid codes are not.
 */

export type InviteFound = { preview: GroupInvitePreview; memberGroupId: string | null };

/** Public page: 20 wrong lookups per client address per 15 minutes. */
export const PAGE_LIMIT = { limit: 20, windowSeconds: 900 } as const;
/** Join with "Crear": 10 wrong lookups per person per hour. */
export const JOIN_LIMIT = { limit: 10, windowSeconds: 3600 } as const;

/** No trustworthy address, no key: skip the limiter rather than share one bucket (as the login does). */
export const pageInviteKey = (ip: string | null) => (ip ? `ginv:addr:${ip}` : null);
export const joinInviteKey = (userId: string) => `gjoin:user:${userId}`;

class Malformed extends Error {}

function mapPreview(data: unknown): InviteFound {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Malformed();
  const o = data as Record<string, unknown>;
  const str = (k: string) => {
    if (typeof o[k] !== "string") throw new Malformed();
    return o[k] as string;
  };
  const num = (k: string) => {
    if (typeof o[k] !== "number" || !Number.isFinite(o[k])) throw new Malformed();
    return o[k] as number;
  };
  const bool = (k: string) => {
    if (typeof o[k] !== "boolean") throw new Malformed();
    return o[k] as boolean;
  };
  const preview: GroupInvitePreview = {
    name: str("name"),
    icon: str("icon"),
    color: str("color"),
    commitment: { name: str("commitment_name"), icon: str("commitment_icon"), targetPerWeek: num("target_per_week"), requiresPhoto: bool("requires_photo") },
    memberCount: num("member_count"),
    full: bool("full"),
  };
  let memberGroupId: string | null = null;
  if (o.member === true) {
    if (!isUuid(o.group_id)) throw new Malformed();
    memberGroupId = o.group_id;
  }
  return { preview, memberGroupId };
}

export async function lookupInvite(a: {
  /** Canonical code (already normalised). */
  code: string;
  viewerId: string | null;
  key: string | null;
  limit: number;
  windowSeconds: number;
  client?: GroupsClient;
}): Promise<InviteOutcome<InviteFound>> {
  let client: GroupsClient;
  try {
    client = a.client ?? createAdminClient();
  } catch {
    return { kind: "failed" };
  }
  const { key } = a;
  return limitedInviteLookup<InviteFound>({
    blocked: async () => {
      if (key === null) return false;
      const r = await rpc.rateLimit(client, key, a.limit, a.windowSeconds, false);
      if (r.error || typeof r.data !== "boolean") throw new Error("limiter");
      return r.data;
    },
    lookup: async () => {
      const r = await rpc.groupInvitePreviewFor(client, a.code, a.viewerId);
      if (r.error) return { ok: false };
      if (r.data === null || r.data === undefined) return { ok: true, data: null };
      try {
        return { ok: true, data: mapPreview(r.data) };
      } catch {
        return { ok: false };
      }
    },
    record: async () => {
      if (key !== null) await rpc.rateLimit(client, key, a.limit, a.windowSeconds, true);
    },
  });
}
