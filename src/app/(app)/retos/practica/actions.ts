"use server";

import { revalidatePath } from "next/cache";
import { localDate, weekStart } from "@/domain/dates";
import { validatePracticeInput } from "@/domain/personal-challenge";
import { requireUser } from "@/lib/require-user";
import { GENERIC } from "@/lib/tracking-copy";

type Result = { ok: true } | { ok: false; error: string };

function refresh() {
  revalidatePath("/retos");
  revalidatePath("/retos/practica");
}

export async function startPractice(input: {
  habitId: string;
  target: number;
  weeks: number;
  fineAmount: number;
}): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = validatePracticeInput(input);
  if (!parsed.ok) return parsed;

  const { data: profile } = await auth.supabase.from("profiles").select("timezone").eq("id", auth.userId).maybeSingle();
  if (!profile) return { ok: false, error: "Inicia sesión para continuar." };
  const { data: habit } = await auth.supabase
    .from("habits")
    .select("id")
    .eq("id", input.habitId)
    .eq("user_id", auth.userId)
    .is("archived_at", null)
    .maybeSingle();
  if (!habit) return { ok: false, error: "Elige un hábito." };

  const { error } = await auth.supabase.from("personal_challenges").insert({
    user_id: auth.userId,
    habit_id: input.habitId,
    frequency_type: "weekly",
    target_per_week: input.target,
    weeks: input.weeks,
    fine_amount: input.fineAmount,
    starts_on: weekStart(localDate(new Date(), profile.timezone)),
    timezone: profile.timezone,
  });
  if (error) {
    if (error.message.includes("personal_challenges_one_open")) {
      return { ok: false, error: "Ya tienes una práctica abierta." };
    }
    return { ok: false, error: GENERIC };
  }
  refresh();
  return { ok: true };
}

export async function cancelPractice(id: string): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data, error } = await auth.supabase
    .from("personal_challenges")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.userId)
    .is("cancelled_at", null)
    .select("id");
  if (error || !data || data.length === 0) return { ok: false, error: GENERIC };
  refresh();
  return { ok: true };
}
