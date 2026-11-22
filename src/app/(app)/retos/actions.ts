"use server";

import { revalidatePath } from "next/cache";
import { REJECT_REASONS, type ChallengeInput, type RejectReason, validateChallengeInput } from "@/lib/challenge-form";
import { notify } from "@/lib/notify";
import { createServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const GENERIC = "No pudimos completar la acción. Inténtalo de nuevo.";
const NOT_AUTH = "Inicia sesión para continuar.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE_HABIT = "Este hábito es solo para ti. Cámbialo a Amigos o Público para retar.";

const ERRORS: Record<string, string> = {
  not_authenticated: NOT_AUTH,
  challenge_not_found: "Este reto ya no existe.",
  not_rival: "No puedes hacer esto en este reto.",
  challenge_not_proposed: "Este reto ya fue respondido.",
  challenge_not_cancellable: "Este reto ya no se puede cancelar.",
  rival_habit_required: "Elige el hábito con el que vas a participar.",
  rival_habit_invalid: "Ese hábito no está disponible. Elige otro que no sea solo para ti.",
  rival_habit_needs_photo: "Este reto exige foto. Elige un hábito que pida foto.",
  not_friends: "Solo puedes retar a tus amigos.",
  reject_window_closed: "Pasaron más de 24 horas. Ya no puedes rechazar esta foto.",
  already_rejected: "Esta foto ya fue rechazada.",
  creator_habit_unavailable: "El hábito de este reto ya no está disponible.",
  checkin_out_of_range: "Esta foto no cuenta para el reto.",
  checkin_not_found: "No encontramos esa foto.",
  invalid_reason: "Elige un motivo.",
};

function mapError(message: string | undefined): string {
  const key = Object.keys(ERRORS).find((k) => message?.includes(k));
  return key ? ERRORS[key] : GENERIC;
}

async function currentUser() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, uid: data.user?.id ?? null };
}

function refresh(id?: string) {
  revalidatePath("/retos");
  if (id) revalidatePath(`/retos/${id}`);
}

export async function proposeChallenge(
  input: ChallengeInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const valid = validateChallengeInput(input);
  if (!valid.ok) return valid;
  if (!UUID.test(input.rivalId) || !UUID.test(input.habitId)) return { ok: false, error: GENERIC };
  const { supabase, uid } = await currentUser();
  if (!uid) return { ok: false, error: NOT_AUTH };
  if (input.rivalId === uid) return { ok: false, error: "Solo puedes retar a tus amigos." };

  const { data: friendship } = await supabase
    .from("friendships")
    .select("id")
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${uid},addressee_id.eq.${input.rivalId}),and(requester_id.eq.${input.rivalId},addressee_id.eq.${uid})`,
    )
    .limit(1);
  if (!friendship || friendship.length === 0) return { ok: false, error: "Solo puedes retar a tus amigos." };

  const { data: habit } = await supabase
    .from("habits")
    .select("name,visibility,requires_photo,archived_at")
    .eq("id", input.habitId)
    .eq("user_id", uid)
    .maybeSingle();
  if (!habit || habit.archived_at) return { ok: false, error: "No encontramos ese hábito." };
  if (habit.visibility === "private") return { ok: false, error: PRIVATE_HABIT };

  const { data: me } = await supabase.from("profiles").select("timezone,first_name").eq("id", uid).maybeSingle();
  if (!me) return { ok: false, error: GENERIC };

  const { data, error } = await supabase
    .from("challenges")
    .insert({
      creator_id: uid,
      rival_id: input.rivalId,
      creator_habit_id: input.habitId,
      frequency_type: input.frequency.type,
      target_per_week: input.frequency.type === "weekly" ? input.frequency.target : null,
      requires_photo: habit.requires_photo,
      weeks: input.weeks,
      fine_amount: input.fineAmount,
      timezone: me.timezone,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.code === "42501" ? PRIVATE_HABIT : GENERIC };
  await notify(input.rivalId, "challenge_proposed", {
    challenge_id: data.id,
    from_id: uid,
    from_name: me.first_name,
    habit_name: habit.name,
    target: input.frequency.type === "weekly" ? input.frequency.target : null,
    fine_amount: input.fineAmount,
  });
  refresh();
  return { ok: true, id: data.id };
}

export async function respondChallenge(id: string, accept: boolean, rivalHabitId?: string): Promise<Result> {
  const { supabase, uid } = await currentUser();
  if (!uid) return { ok: false, error: NOT_AUTH };
  const { error } = await supabase.rpc("respond_challenge", {
    p_id: id,
    p_accept: accept,
    p_rival_habit_id: rivalHabitId,
  });
  if (error) return { ok: false, error: mapError(error.message) };
  refresh(id);
  return { ok: true };
}

export async function requestCancel(
  id: string,
): Promise<{ ok: true; cancelled: boolean } | { ok: false; error: string }> {
  const { supabase, uid } = await currentUser();
  if (!uid) return { ok: false, error: NOT_AUTH };
  const { data, error } = await supabase.rpc("request_cancel", { p_id: id });
  if (error) return { ok: false, error: mapError(error.message) };
  refresh(id);
  return { ok: true, cancelled: data === true };
}

export async function rejectCheckin(checkinId: string, reason: RejectReason): Promise<Result> {
  if (!REJECT_REASONS.includes(reason)) return { ok: false, error: ERRORS.invalid_reason };
  const { supabase, uid } = await currentUser();
  if (!uid) return { ok: false, error: NOT_AUTH };
  const { error } = await supabase.rpc("reject_checkin", { p_checkin_id: checkinId, p_reason: reason });
  if (error) return { ok: false, error: mapError(error.message) };
  refresh();
  revalidatePath("/retos/[id]", "page");
  return { ok: true };
}
