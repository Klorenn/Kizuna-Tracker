import { GROUP_LIMITS, type GroupActions, type GroupDraft } from "@/lib/groups-contract";

export const GROUP_FORM_ERRORS = {
  name: `El nombre debe tener entre ${GROUP_LIMITS.nameMin} y ${GROUP_LIMITS.nameMax} letras.`,
  commitment: "Escribe el compromiso del grupo.",
  commitmentLong: `El compromiso puede tener hasta ${GROUP_LIMITS.commitmentMax} letras.`,
  target: `Elige entre ${GROUP_LIMITS.targetMin} y ${GROUP_LIMITS.targetMax} veces por semana.`,
  descriptionLong: `La descripción puede tener hasta ${GROUP_LIMITS.descriptionMax} letras.`,
  habit: "Elige uno de tus hábitos.",
  generic: "No pudimos crear el grupo. Inténtalo de nuevo.",
} as const;

export type GroupDraftErrors = {
  name?: string;
  description?: string;
  commitment?: string;
  target?: string;
  habit?: string;
};

export function normalizeDraft(d: GroupDraft): GroupDraft {
  return {
    ...d,
    name: d.name.trim(),
    description: d.description.trim(),
    commitment: { ...d.commitment, name: d.commitment.name.trim() },
  };
}

export function validateGroupDraft(draft: GroupDraft): GroupDraftErrors {
  const d = normalizeDraft(draft);
  const errors: GroupDraftErrors = {};
  if (d.name.length < GROUP_LIMITS.nameMin || d.name.length > GROUP_LIMITS.nameMax) errors.name = GROUP_FORM_ERRORS.name;
  if (d.description.length > GROUP_LIMITS.descriptionMax) errors.description = GROUP_FORM_ERRORS.descriptionLong;
  if (d.commitment.name.length === 0) errors.commitment = GROUP_FORM_ERRORS.commitment;
  else if (d.commitment.name.length > GROUP_LIMITS.commitmentMax) errors.commitment = GROUP_FORM_ERRORS.commitmentLong;
  const t = d.commitment.targetPerWeek;
  if (!Number.isInteger(t) || t < GROUP_LIMITS.targetMin || t > GROUP_LIMITS.targetMax) errors.target = GROUP_FORM_ERRORS.target;
  if (d.habit.kind === "habit" && !d.habit.habitId) errors.habit = GROUP_FORM_ERRORS.habit;
  return errors;
}

export type SubmitGroupResult =
  | { ok: true; id: string }
  | { ok: false; errors: GroupDraftErrors }
  | { ok: false; error: string };

/**
 * The form's submit, with the double-submit guard. null: a submit is already under way, nothing
 * happened. Invalid: field errors, action not called. Success: `onCreated(id)` once and the guard
 * stays locked (the page navigates away). Failure: the message, guard released.
 */
export async function runCreate({
  guard,
  draft,
  create,
  onCreated,
}: {
  guard: { current: boolean };
  draft: GroupDraft;
  create: GroupActions["create"];
  onCreated: (id: string) => void;
}): Promise<SubmitGroupResult | null> {
  if (guard.current) return null;
  if (Object.keys(validateGroupDraft(draft)).length > 0) return submitGroup(draft, create);
  guard.current = true;
  const r = await submitGroup(draft, create);
  if (r.ok) onCreated(r.id);
  else guard.current = false;
  return r;
}

/** Validates, then calls the action. Never throws: a failed call is an error message. */
export async function submitGroup(draft: GroupDraft, create: GroupActions["create"]): Promise<SubmitGroupResult> {
  const errors = validateGroupDraft(draft);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  try {
    const r = await create(normalizeDraft(draft));
    return r.ok ? { ok: true, id: r.data.id } : { ok: false, error: r.error };
  } catch {
    return { ok: false, error: GROUP_FORM_ERRORS.generic };
  }
}
