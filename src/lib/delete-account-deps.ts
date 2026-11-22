import "server-only";
import type { DeleteAccountDeps } from "@/lib/delete-account";
import { createAdminClient } from "@/lib/supabase/admin";

const CHUNK = 500;

/**
 * Service-role adapter for deleteAccountWith. Habits that a challenge still references
 * cannot be deleted (foreign key) and their check-in dates are what the cron bills ended
 * periods with, so those are kept: habits are archived and renamed, check-ins lose their photos.
 */
export function supabaseDeleteDeps(): DeleteAccountDeps {
  const admin = createAdminClient();

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
      if (table === "goals" || table === "checkin_items" || table === "habit_items") {
        const { error } = await admin.from(table).delete().eq("user_id", userId);
        return must(error);
      }
      const kept = await challengeHabitIds(userId);
      if (table === "checkins") {
        let q = admin.from("checkins").delete().eq("user_id", userId);
        if (kept.length) q = q.not("habit_id", "in", `(${kept.join(",")})`);
        must((await q).error);
        if (kept.length) {
          const { error } = await admin
            .from("checkins")
            .update({ photo_path: null, photo_sha256: null })
            .eq("user_id", userId);
          must(error);
        }
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
    async banAndFreeEmail(userId, freedEmail) {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        email: freedEmail,
        email_confirm: true,
        ban_duration: "876000h",
        user_metadata: {},
      });
      must(error);
    },
  };
}
