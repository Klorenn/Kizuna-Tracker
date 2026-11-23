import "server-only";
import type { DeletableTable, DeleteAccountDeps } from "@/lib/delete-account";
import { createAdminClient } from "@/lib/supabase/admin";

const CHUNK = 500;
const OWN_ROWS: ReadonlySet<DeletableTable> = new Set([
  "workout_sets",
  "workout_sessions",
  "reading_entries",
  "books",
  "exercises",
  "pomodoro_blocks",
  "time_entries",
  "watch_entries",
  "media_items",
  "quantity_entries",
  "cardio_entries",
  "body_weights",
  "goals",
  "checkin_items",
  "habit_items",
]);
/** Every key registro/actions.ts sends as signup metadata. */
export const SIGNUP_METADATA_KEYS = ["username", "first_name", "last_name", "birth_date", "timezone", "terms_accepted", "avatar_preset"] as const;

/**
 * Service-role adapter for deleteAccountWith. Habits that a challenge still references
 * cannot be deleted (foreign key) and their check-in dates are what the cron bills ended
 * periods with, so those are kept: habits are archived and renamed. Their check-ins stay
 * untouched (photo_path included: the cron counts photo check-ins to know when a period is
 * closable, and the path holds no personal data; the object itself is already deleted).
 */
export function supabaseDeleteDeps(
  admin: ReturnType<typeof createAdminClient> = createAdminClient(),
  /** The caller's access token: GoTrue's admin sign-out revokes every session of the token's user. */
  accessToken?: string,
): DeleteAccountDeps {
  async function challengeHabitIds(userId: string): Promise<string[]> {
    const { data: mine } = await admin.from("habits").select("id").eq("user_id", userId);
    const ids = (mine ?? []).map((h) => h.id);
    if (ids.length === 0) return [];
    const list = ids.join(",");
    const { data } = await admin
      .from("challenges")
      .select("creator_habit_id,rival_habit_id")
      .or(`creator_habit_id.in.(${list}),rival_habit_id.in.(${list})`);
    const used = new Set((data ?? []).flatMap((c) => [c.creator_habit_id, c.rival_habit_id]));
    return ids.filter((id) => used.has(id));
  }

  const must = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };

  return {
    async listObjects(bucket, prefix) {
      const out: string[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
        must(error);
        const rows = data ?? [];
        // folders come back without an id
        out.push(...rows.filter((r) => r.id).map((r) => `${prefix}/${r.name}`));
        if (rows.length < 1000) break;
      }
      return out;
    },
    async removeObjects(bucket, paths) {
      for (let i = 0; i < paths.length; i += CHUNK) {
        const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + CHUNK));
        must(error);
      }
    },
    async deleteRows(table, userId) {
      // exercises: only the user's own rows (the shared catalog has user_id null and is never matched)
      if (OWN_ROWS.has(table)) {
        const { error } = await admin.from(table).delete().eq("user_id", userId);
        return must(error);
      }
      const kept = await challengeHabitIds(userId);
      if (table === "checkins") {
        let q = admin.from("checkins").delete().eq("user_id", userId);
        if (kept.length) q = q.not("habit_id", "in", `(${kept.join(",")})`);
        must((await q).error);
        return;
      }
      let q = admin.from("habits").delete().eq("user_id", userId);
      if (kept.length) q = q.not("id", "in", `(${kept.join(",")})`);
      must((await q).error);
      if (kept.length) {
        const { error } = await admin
          .from("habits")
          .update({ name: "Hábito", archived_at: new Date().toISOString(), visibility: "private" })
          .in("id", kept);
        must(error);
      }
    },
    async cancelChallenges(userId) {
      const { error } = await admin
        .from("challenges")
        .update({ status: "cancelled" })
        .in("status", ["proposed", "active"])
        .or(`creator_id.eq.${userId},rival_id.eq.${userId}`);
      must(error);
    },
    async purgeSocial(userId) {
      must((await admin.from("friendships").delete().or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)).error);
      must((await admin.from("invites").delete().eq("inviter_id", userId)).error);
      must((await admin.from("notifications").delete().eq("user_id", userId)).error);
      must((await admin.from("push_subscriptions").delete().eq("user_id", userId)).error);
    },
    async scrubProfile(userId, patch) {
      must((await admin.from("profiles").update(patch).eq("id", userId)).error);
    },
    async revokeSessions() {
      if (!accessToken) return;
      try {
        await admin.auth.admin.signOut(accessToken, "global");
      } catch {
        // best effort: the ban below blocks refreshes anyway
      }
    },
    async banAndFreeEmail(userId, freedEmail) {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        email: freedEmail,
        email_confirm: true,
        ban_duration: "876000h",
        // GoTrue merges metadata: a key is only removed by sending null
        user_metadata: Object.fromEntries(SIGNUP_METADATA_KEYS.map((k) => [k, null])),
      });
      must(error);
    },
  };
}
