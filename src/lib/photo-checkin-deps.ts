import "server-only";
import type { PhotoCheckinDeps, PhotoTarget } from "@/lib/checkins";
import { createAdminClient } from "@/lib/supabase/admin";

/** Service-role adapter: queries tables directly, never trusts client-supplied ids beyond lookups. */
export function supabaseDeps(): PhotoCheckinDeps {
  const admin = createAdminClient();
  const table = (t: PhotoTarget) => (t.kind === "habit" ? "checkins" : "checkin_items");
  return {
    async getProfile(userId) {
      const { data } = await admin
        .from("profiles")
        .select("timezone,deleted_at")
        .eq("id", userId)
        .maybeSingle();
      return data;
    },
    async getHabit(habitId) {
      const { data } = await admin
        .from("habits")
        .select("id,user_id,requires_photo,archived_at,log_type")
        .eq("id", habitId)
        .maybeSingle();
      return data;
    },
    async getItem(itemId) {
      const { data } = await admin
        .from("habit_items")
        .select("id,habit_id,user_id,requires_photo,archived_at,habits!inner(user_id,archived_at,requires_photo)")
        .eq("id", itemId)
        .maybeSingle();
      if (!data) return null;
      const { habits, ...item } = data;
      return {
        ...item,
        habit_user_id: habits.user_id,
        habit_archived_at: habits.archived_at,
        habit_requires_photo: habits.requires_photo,
      };
    },
    async findCheckin(target, date) {
      const q =
        target.kind === "habit"
          ? admin.from("checkins").select("id").eq("habit_id", target.habitId)
          : admin.from("checkin_items").select("id").eq("item_id", target.itemId);
      const { data } = await q.eq("local_date", date).maybeSingle();
      return data;
    },
    async insertCheckin(target, row) {
      const base = {
        id: row.id,
        user_id: row.userId,
        local_date: row.localDate,
        photo_path: row.path,
        photo_sha256: row.sha256,
      };
      const res =
        target.kind === "habit"
          ? await admin
              .from("checkins")
              .insert({ ...base, habit_id: target.habitId })
              .select("is_duplicate")
              .single()
          : await admin
              .from("checkin_items")
              .insert({ ...base, habit_id: row.habitId, item_id: target.itemId })
              .select("is_duplicate")
              .single();
      if (res.error || !res.data) throw new Error(res.error?.message ?? "insert failed");
      return { isDuplicate: res.data.is_duplicate };
    },
    async deleteCheckin(target, id) {
      await admin.from(table(target)).delete().eq("id", id);
    },
    async upload(path, bytes) {
      const { error } = await admin.storage
        .from("proofs")
        .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
    },
    async completeDay(habitId, userId, date) {
      const { data, error } = await admin.rpc("complete_day_from_items", {
        p_habit_id: habitId,
        p_user_id: userId,
        p_date: date,
      });
      if (error) throw error;
      return data === true;
    },
  };
}
