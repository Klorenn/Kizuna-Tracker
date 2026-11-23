import { NextResponse } from "next/server";
import {
  contentLengthError,
  photoCheckin,
  type PhotoCheckinDeps,
  type PhotoCheckinResult,
  type PhotoTarget,
} from "@/lib/checkins";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function json(result: PhotoCheckinResult) {
  return NextResponse.json(result, { status: result.status });
}

/** Service-role adapter: queries tables directly, never trusts client-supplied ids beyond lookups. */
function supabaseDeps(): PhotoCheckinDeps {
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

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch {
    return json({ status: 502, error: "No pudimos guardar la foto. Inténtalo de nuevo." });
  }
}

async function handle(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ status: 401, error: "Inicia sesión para continuar." });

  // a body without a valid Content-Length (e.g. chunked) is refused before buffering
  const tooBig = contentLengthError(request.headers.get("content-length"));
  if (tooBig) return json(tooBig);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ status: 400, error: "Solicitud no válida." });
  }
  const file = form.get("file");
  const habitId = form.get("habitId");
  const itemId = form.get("itemId");
  if (!(file instanceof File)) return json({ status: 400, error: "Falta la foto." });
  let target: PhotoTarget;
  if (typeof itemId === "string" && itemId && !habitId) target = { kind: "item", itemId };
  else if (typeof habitId === "string" && habitId && !itemId) target = { kind: "habit", habitId };
  else return json({ status: 400, error: "Falta el hábito o el paso." });

  const result = await photoCheckin(
    supabaseDeps(),
    user.id,
    target,
    { bytes: await file.arrayBuffer(), type: file.type, size: file.size },
    new Date(),
  );
  return json(result);
}
