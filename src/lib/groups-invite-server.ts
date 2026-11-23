import "server-only";
import { limitedInviteLookup, type InviteOutcome } from "@/domain/group-invite";
import { isUuid } from "@/domain/groups";
import type { GroupInvitePreview } from "@/lib/groups-contract";
import * as rpc from "@/lib/groups-rpc";
import type { GroupsClient, RpcAnswer } from "@/lib/groups-rpc";
import { ipBucket } from "@/lib/request-ip";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Invitation lookups. The preview function and the limiter are service-role only (migration 0024), so this is the one
 * server-only module that holds the service client for them; the key never reaches a client component. `viewerId` is the
 * signed-in person's id from the session, never from the request. Wrong guesses are counted, valid codes are not, and the
 * limit check, the lookup and the count are ONE database call (`group_invite_lookup`), so a burst cannot outrun the limit.
 */

export type InviteFound = { preview: GroupInvitePreview; memberGroupId: string | null };

/** Public page: 20 wrong lookups per client address per 15 minutes. */
export const PAGE_LIMIT = { limit: 20, windowSeconds: 900 } as const;
/** Join with "Crear": 10 wrong lookups per person per hour. */
export const JOIN_LIMIT = { limit: 10, windowSeconds: 3600 } as const;

/** IPv6 by its /64 prefix, IPv4 as is; a missing or unparseable address shares the fixed key `ginv:addr:unknown`. */
export const pageInviteKey = (ip: string | null) => `ginv:addr:${ipBucket(ip)}`;
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

type LookupArgs = Database["public"]["Functions"]["group_invite_lookup"]["Args"];

/** `group_invite_lookup` (service role only). The generated argument names are checked; `p_viewer` is null when signed out. */
function groupInviteLookup(client: GroupsClient, a: { code: string; viewer: string | null; key: string; limit: number; windowSeconds: number }) {
  const args: { [K in keyof LookupArgs]: LookupArgs[K] | null } = {
    p_code: a.code,
    p_viewer: a.viewer,
    p_key: a.key,
    p_limit: a.limit,
    p_window_seconds: a.windowSeconds,
  };
  const rpcFn = client.rpc as (fn: string, args: Record<string, unknown>) => PromiseLike<RpcAnswer<unknown>>;
  return rpcFn.call(client, "group_invite_lookup", args);
}

function mapLookup(data: unknown): { limited: boolean; data: InviteFound | null } {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Malformed();
  const o = data as Record<string, unknown>;
  if (typeof o.limited !== "boolean" || !("preview" in o)) throw new Malformed();
  if (o.limited) return { limited: true, data: null };
  if (o.preview === null) return { limited: false, data: null };
  return { limited: false, data: mapPreview(o.preview) };
}

export async function lookupInvite(a: {
  /** Canonical code (already normalised). */
  code: string;
  viewerId: string | null;
  /** Null ONLY for the local-development skip (`skipRateLimit`): then the lookup runs without a limiter. */
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
    lookup: async () => {
      if (key === null) {
        const r = await rpc.groupInvitePreviewFor(client, a.code, a.viewerId);
        if (r.error) return { ok: false };
        if (r.data === null || r.data === undefined) return { ok: true, limited: false, data: null };
        try {
          return { ok: true, limited: false, data: mapPreview(r.data) };
        } catch {
          return { ok: false };
        }
      }
      const r = await groupInviteLookup(client, { code: a.code, viewer: a.viewerId, key, limit: a.limit, windowSeconds: a.windowSeconds });
      if (r.error) return { ok: false };
      try {
        return { ok: true, ...mapLookup(r.data) };
      } catch {
        return { ok: false };
      }
    },
  });
}
