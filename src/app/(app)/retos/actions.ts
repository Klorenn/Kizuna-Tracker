"use server";

import { revalidatePath } from "next/cache";
import { createHabit } from "@/app/(app)/habitos/actions";
import { challengeFrequency } from "@/lib/challenge-view";
import { CHALLENGE_ERRORS, GENERIC_ERROR, mapChallengeError } from "@/lib/challenge-errors";
import {
  SOURCE_HABIT_COLUMNS,
  habitDraftFromChallenge,
  sourceFromRow,
  type SourceHabitRow,
} from "@/lib/challenge-accept";
import { requireUser } from "@/lib/require-user";
import {
  OPEN_CHALLENGE_STATUSES,
  REJECT_REASONS,
  type ChallengeInput,
  type RejectReason,
  validateAddItemInput,
  validateChallengeInput,
} from "@/lib/challenge-form";
import type { Frequency } from "@/domain/types";
import { notify } from "@/lib/notify";
import { createServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const GENERIC = GENERIC_ERROR;
const NOT_AUTH = "Inicia sesión para continuar.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE_HABIT = "Este hábito es solo para ti. Cámbialo a Amigos o Público para retar.";

const ERRORS = CHALLENGE_ERRORS;
const mapError = mapChallengeError;

async function currentUser() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, uid: data.user?.id ?? null };
}

function refresh(id?: string) {
  revalidatePath("/retos");
  if (id) revalidatePath(`/retos/${id}`);
}

/** Sub-reto changes also show on the friend profile (the "Agregar sub-reto" / "Ver reto" action) and on Hoy. */
function refreshWithProfile(id?: string) {
  refresh(id);
  revalidatePath("/u/[username]", "page");
  revalidatePath("/");
}

const EXISTS = "Ya tienes un reto con esta persona.";

/** Terms of the open challenge a "new" challenge collided with: the form switches to "add sub-reto" with them. */
export type ExistingTerms = { status: string; frequency: Frequency; weeks: number; fineAmount: number };

/**
 * `code: "exists"` = a proposed or active challenge with that person is already there; `existingId` is its id and
 * `terms` its status and terms (absent when only the database unique index caught the race).
 */
export type ProposeResult =
  | { ok: true; id: string }
  | { ok: false; error: string; code?: "exists"; existingId?: string; terms?: ExistingTerms };

export async function proposeChallenge(input: ChallengeInput): Promise<ProposeResult> {
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

  const { data: open } = await supabase
    .from("challenges")
    .select("id,status,frequency_type,target_per_week,weeks,fine_amount")
    .in("status", [...OPEN_CHALLENGE_STATUSES])
    .or(
      `and(creator_id.eq.${uid},rival_id.eq.${input.rivalId}),and(creator_id.eq.${input.rivalId},rival_id.eq.${uid})`,
    )
    .order("created_at", { ascending: false })
    .limit(1);
  if (open && open.length > 0) {
    const o = open[0];
    return {
      ok: false,
      code: "exists",
      existingId: o.id,
      terms: { status: o.status, frequency: challengeFrequency(o), weeks: o.weeks, fineAmount: o.fine_amount },
      error: EXISTS,
    };
  }

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
  if (error?.code === "23505") return { ok: false, code: "exists", error: EXISTS };
  if (error || !data) return { ok: false, error: error?.code === "42501" ? PRIVATE_HABIT : GENERIC };
  await notify(input.rivalId, "challenge_proposed", {
    challenge_id: data.id,
    from_id: uid,
    from_name: me.first_name,
    habit_name: habit.name,
    target: input.frequency.type === "weekly" ? input.frequency.target : null,
    fine_amount: input.fineAmount,
  }, { defer: true });
  refresh();
  return { ok: true, id: data.id };
}

/**
 * `choice`: one habit id (single-item challenge, legacy) or a map itemId -> habitId (one rival habit per
 * proposed item, sent as p_item_habits).
 */
export async function respondChallenge(
  id: string,
  accept: boolean,
  choice?: string | Record<string, string>,
): Promise<Result> {
  const { supabase, uid } = await currentUser();
  if (!uid) return { ok: false, error: NOT_AUTH };
  const args =
    choice && typeof choice === "object"
      ? { p_id: id, p_accept: accept, p_item_habits: choice }
      : { p_id: id, p_accept: accept, p_rival_habit_id: choice };
  const { error } = await supabase.rpc("respond_challenge", args);
  if (error) return { ok: false, error: mapError(error.message) };
  refresh(id);
  return { ok: true };
}

export type HabitChoice = { habitId: string } | "create";

/**
 * "Aceptar reto" with a habit per proposed sub-reto: an existing habit or "Crear «…»" (the habit is created
 * through the same path as any new habit, copying the proposer's). Not atomic by design: if joining fails, the
 * habits this very call created are removed again (they have no history), so nobody ends with extra habits.
 */
export async function acceptChallengeWithHabits(
  id: string,
  choices: Record<string, HabitChoice>,
): Promise<{ ok: true; habitIds: Record<string, string> } | { ok: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, userId: uid } = auth;
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: GENERIC };
  for (const [itemId, c] of Object.entries(choices ?? {})) {
    if (!UUID.test(itemId)) return { ok: false, error: GENERIC };
    if (c !== "create" && !(c && typeof c === "object" && typeof c.habitId === "string" && UUID.test(c.habitId))) {
      return { ok: false, error: GENERIC };
    }
  }

  // the caller's own session reads the rows: RLS decides what a friend may see
  const { data: ch, error: chError } = await supabase
    .from("challenges")
    .select("id,creator_id,rival_id,status,frequency_type,target_per_week")
    .eq("id", id)
    .maybeSingle();
  if (chError) return { ok: false, error: GENERIC };
  if (!ch) return { ok: false, error: ERRORS.challenge_not_found };
  if (ch.rival_id !== uid) return { ok: false, error: ERRORS.not_rival };
  if (ch.status !== "proposed") return { ok: false, error: ERRORS.challenge_not_proposed };

  type ItemRow = {
    id: string;
    creator_habit_id: string | null;
    target_per_week: number | null;
    requires_photo: boolean;
  };
  const { data: itemRows, error: itemsError } = await supabase
    .from("challenge_items")
    .select("id,position,creator_habit_id,target_per_week,requires_photo,status")
    .eq("challenge_id", id)
    .eq("status", "proposed")
    .order("position", { ascending: true });
  if (itemsError) return { ok: false, error: GENERIC };
  const items = (itemRows ?? []) as ItemRow[];
  if (items.length === 0) return { ok: false, error: ERRORS.item_not_found };
  const itemIds = new Set(items.map((i) => i.id));
  if (Object.keys(choices).some((k) => !itemIds.has(k))) return { ok: false, error: ERRORS.item_not_found };
  if (items.some((i) => !choices[i.id])) return { ok: false, error: ERRORS.rival_habit_required };

  const created: string[] = [];
  const removeCreated = async () => {
    for (const habitId of created) {
      await supabase.from("habits").delete().eq("id", habitId).eq("user_id", uid).select("id");
    }
    if (created.length > 0) revalidatePath("/");
  };

  const habitIds: Record<string, string> = {};
  const draftNames: string[] = [];
  for (const item of items) {
    const c = choices[item.id];
    if (c !== "create") {
      habitIds[item.id] = c.habitId;
      continue;
    }
    const { data: row, error: rowError } = await supabase
      .from("habits")
      .select(SOURCE_HABIT_COLUMNS)
      .eq("id", item.creator_habit_id ?? "")
      .maybeSingle();
    if (rowError || !row) {
      await removeCreated();
      return { ok: false, error: rowError ? GENERIC : ERRORS.creator_habit_unavailable };
    }
    const { draft } = habitDraftFromChallenge(sourceFromRow(row as unknown as SourceHabitRow), {
      frequency: challengeFrequency({ frequency_type: ch.frequency_type, target_per_week: item.target_per_week }),
      requiresPhoto: item.requires_photo,
    });
    const made = await createHabit(draft);
    if (!made.ok) {
      await removeCreated();
      return made;
    }
    created.push(made.id);
    habitIds[item.id] = made.id;
    draftNames.push(draft.name.trim());
  }

  const { error } = await supabase.rpc("respond_challenge", {
    p_id: id,
    p_accept: true,
    p_item_habits: habitIds,
  });
  if (error) {
    // the response may be lost while the accept committed: ask the challenge before judging
    const { data: now, error: rereadError } = await supabase
      .from("challenges")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    const { data: nowItems, error: nowItemsError } = await supabase
      .from("challenge_items")
      .select("id,rival_habit_id,status")
      .eq("challenge_id", id)
      .eq("status", "active");
    if (rereadError || nowItemsError) {
      return {
        ok: false,
        error: created.length
          ? `No pudimos confirmar el reto. Creamos ${draftNames.map((n) => `«${n}»`).join(", ")} en tus hábitos; revisa Retos antes de reintentar.`
          : GENERIC,
      };
    }
    const mine = new Map(((nowItems ?? []) as { id: string; rival_habit_id: string | null }[]).map((i) => [i.id, i.rival_habit_id]));
    if (now?.status === "active" && items.every((i) => mine.get(i.id) === habitIds[i.id])) {
      refresh(id);
      revalidatePath("/");
      return { ok: true, habitIds };
    }
    // only the habits created above, only if still the caller's: never anything else
    await removeCreated();
    if (created.length > 0 && !(now?.status === "proposed")) {
      return {
        ok: false,
        error: `El reto ya no está disponible. Creamos ${draftNames.map((n) => `«${n}»`).join(", ")} en tus hábitos; puedes archivarlos.`,
      };
    }
    return { ok: false, error: mapError(error.message) };
  }
  refresh(id);
  revalidatePath("/");
  return { ok: true, habitIds };
}

// ---- sub-retos (challenge_items) ----

export type AddItemResult =
  | { ok: true; itemId: string }
  | { ok: false; error: string; code?: "ending" | "duplicate" | "too_many" };

const LIVE_HABIT_INDEX = "challenge_items_live_";
const ADD_CODES: Record<string, "ending" | "duplicate" | "too_many"> = {
  challenge_ending: "ending",
  habit_already_in_challenge: "duplicate",
  too_many_items: "too_many",
};

async function firstName(supabase: unknown, uid: string): Promise<string | null> {
  const { data } = await (supabase as Awaited<ReturnType<typeof createServerClient>>)
    .from("profiles")
    .select("first_name")
    .eq("id", uid)
    .maybeSingle();
  return data?.first_name ?? null;
}

async function habitName(supabase: unknown, habitId: string | null | undefined): Promise<string | null> {
  if (!habitId) return null;
  const { data } = await (supabase as Awaited<ReturnType<typeof createServerClient>>)
    .from("habits")
    .select("name")
    .eq("id", habitId)
    .maybeSingle();
  return data?.name ?? null;
}

/**
 * "Agregar sub-reto": the caller proposes one more habit inside an open challenge. The frequency, weeks and
 * fine are the challenge's, so only the habit (and, if weekly, the target) is sent. The other player is told only
 * once the challenge is active: while it is still proposed they answer everything together in one accept.
 */
export async function addChallengeItem(input: {
  challengeId: string;
  habitId: string;
  target: number | null;
}): Promise<AddItemResult> {
  if (!input || typeof input.challengeId !== "string" || !UUID.test(input.challengeId)) {
    return { ok: false, error: ERRORS.challenge_not_found };
  }
  if (typeof input.habitId !== "string" || !UUID.test(input.habitId)) return { ok: false, error: "Elige un hábito." };
  const { supabase, uid } = await currentUser();
  if (!uid) return { ok: false, error: NOT_AUTH };

  const { data: ch, error: chError } = await supabase
    .from("challenges")
    .select("status,creator_id,rival_id,frequency_type")
    .eq("id", input.challengeId)
    .maybeSingle();
  if (chError) return { ok: false, error: GENERIC };
  if (!ch) return { ok: false, error: ERRORS.challenge_not_found };

  const target = input.target ?? null;
  const valid = validateAddItemInput(
    { challengeId: input.challengeId, habitId: input.habitId, target },
    ch.frequency_type === "weekly" ? "weekly" : "daily",
  );
  if (!valid.ok) return valid;

  const { data, error } = await supabase.rpc("add_challenge_item", {
    p_challenge_id: input.challengeId,
    p_habit_id: input.habitId,
    // the database default (null) is daily
    ...(target === null ? {} : { p_target_per_week: target }),
  });
  if (error) {
    // a race on the live-habit unique index surfaces as 23505, not as the RPC's own code
    const code = ADD_CODES[error.message] ?? (error.message?.includes(LIVE_HABIT_INDEX) ? "duplicate" : undefined);
    return { ok: false, error: mapError(error.message), code };
  }
  const itemId = typeof data === "string" ? data : "";

  if (ch.status === "active") {
    const other = ch.creator_id === uid ? ch.rival_id : ch.creator_id;
    const [name, habit] = await Promise.all([firstName(supabase, uid), habitName(supabase, input.habitId)]);
    await notify(other, "challenge_item_proposed", {
      challenge_id: input.challengeId,
      item_id: itemId,
      from_id: uid,
      from_name: name,
      habit_name: habit,
      target,
    }, { defer: true });
  }
  refreshWithProfile(input.challengeId);
  return { ok: true, itemId };
}

/**
 * Answer a sub-reto proposed while the challenge is active (the other player's turn): accept with one of your
 * habits, or decline. The proposer is told either way.
 */
export async function respondChallengeItem(itemId: string, accept: boolean, habitId?: string): Promise<Result> {
  if (typeof itemId !== "string" || !UUID.test(itemId)) return { ok: false, error: ERRORS.item_not_found };
  if (habitId !== undefined && !UUID.test(habitId)) return { ok: false, error: ERRORS.habit_required };
  const { supabase, uid } = await currentUser();
  if (!uid) return { ok: false, error: NOT_AUTH };

  // read before answering: once accepted the proposer's habit is no longer the only one on the row
  const { data: item } = await supabase
    .from("challenge_items")
    .select("proposed_by,creator_habit_id,rival_habit_id")
    .eq("id", itemId)
    .maybeSingle();

  const { data, error } = await supabase.rpc("respond_challenge_item", {
    p_item_id: itemId,
    p_accept: accept,
    ...(accept && habitId ? { p_habit_id: habitId } : {}),
  });
  if (error) return { ok: false, error: mapError(error.message) };
  const challengeId = typeof data === "string" ? data : undefined;

  const row = item as { proposed_by: string; creator_habit_id: string | null; rival_habit_id: string | null } | null;
  if (row?.proposed_by && challengeId) {
    const [name, habit] = await Promise.all([
      firstName(supabase, uid),
      habitName(supabase, row.creator_habit_id ?? row.rival_habit_id),
    ]);
    await notify(row.proposed_by, accept ? "challenge_item_accepted" : "challenge_item_declined", {
      challenge_id: challengeId,
      item_id: itemId,
      from_id: uid,
      from_name: name,
      habit_name: habit,
    }, { defer: true });
  }
  refreshWithProfile(challengeId);
  return { ok: true };
}

/** The proposer takes back a sub-reto nobody has answered yet. Silent by design. */
export async function withdrawChallengeItem(itemId: string): Promise<Result> {
  if (typeof itemId !== "string" || !UUID.test(itemId)) return { ok: false, error: ERRORS.item_not_found };
  const { supabase, uid } = await currentUser();
  if (!uid) return { ok: false, error: NOT_AUTH };
  const { data, error } = await supabase.rpc("withdraw_challenge_item", { p_item_id: itemId });
  if (error) return { ok: false, error: mapError(error.message) };
  refreshWithProfile(typeof data === "string" ? data : undefined);
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
