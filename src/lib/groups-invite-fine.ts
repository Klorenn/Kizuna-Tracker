import "server-only";
import type { GroupsClient } from "@/lib/groups-rpc";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The fine in force of an invitation (`group_invite_fine_for`, granted to the service role only): amount and purpose, or
 * null when the code is not valid or the group has no fine (one approved to start next Monday is returned too). Called only after a successful preview and
 * it never counts attempts. Any failure means "no fine shown": the join must not break because of it. The code is never logged.
 */
export type InviteFine = { amount: number; purpose: string };

export async function loadInviteFine(code: string, client?: GroupsClient): Promise<InviteFine | null> {
  try {
    const c = client ?? createAdminClient();
    const { data, error } = (await c.rpc("group_invite_fine_for", { p_code: code })) as {
      data: unknown;
      error: { message: string } | null;
    };
    if (error) {
      console.error("group_invite_fine_for failed");
      return null;
    }
    if (data === null || data === undefined) return null;
    if (typeof data !== "object" || Array.isArray(data)) return null;
    const o = data as Record<string, unknown>;
    const { amount, purpose } = o;
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) return null;
    if (typeof purpose !== "string" || purpose.trim() === "") return null;
    return { amount, purpose };
  } catch {
    console.error("group_invite_fine_for failed");
    return null;
  }
}
