"use server";

import { revalidatePath } from "next/cache";
import { localDate } from "@/domain/dates";
import { validateGoal } from "@/domain/goals";
import { createServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC = "No pudimos guardar la meta. Inténtalo de nuevo.";

export async function createGoal(input: {
  habitId: string;
  kind: "weekly" | "total";
  target: number;
  deadline: string | null;
}): Promise<Result> {
  if (!UUID.test(input.habitId)) return { ok: false, error: GENERIC };
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { ok: false, error: "Inicia sesión para continuar." };
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", uid).maybeSingle();
  if (!profile) return { ok: false, error: GENERIC };

  const today = localDate(new Date(), profile.timezone);
  const deadline = input.kind === "total" ? input.deadline || null : null;
  const valid = validateGoal({ kind: input.kind, target: input.target, deadline }, today);
  if (!valid.ok) return valid;

  const { error } = await supabase.from("goals").insert({
    user_id: uid,
    habit_id: input.habitId,
    kind: input.kind,
    target: input.target,
    starts_on: today,
    deadline,
  });
  if (error) return { ok: false, error: GENERIC };
  revalidatePath("/metas");
  revalidatePath("/perfil");
  return { ok: true };
}

export async function archiveGoal(id: string): Promise<Result> {
  if (!UUID.test(id)) return { ok: false, error: GENERIC };
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { ok: false, error: "Inicia sesión para continuar." };
  const { data, error } = await supabase
    .from("goals")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", uid)
    .select("id");
  if (error || !data || data.length === 0) return { ok: false, error: GENERIC };
  revalidatePath("/metas");
  revalidatePath("/perfil");
  return { ok: true };
}
