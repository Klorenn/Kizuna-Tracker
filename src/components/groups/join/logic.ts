import type { GroupActions, GroupHabitChoice } from "@/lib/groups-contract";

export const JOIN_ERRORS = {
  habit: "Elige uno de tus hábitos.",
  generic: "No pudimos unirte al grupo. Inténtalo de nuevo.",
} as const;

/** The join submit with the double-submit guard (same contract as `runCreate`). */
export async function runJoin({
  guard,
  code,
  habit,
  join,
  onJoined,
}: {
  guard: { current: boolean };
  code: string;
  habit: GroupHabitChoice;
  join: GroupActions["join"];
  onJoined: (id: string) => void;
}): Promise<{ ok: true; id: string } | { ok: false; error: string } | null> {
  if (guard.current) return null;
  if (habit.kind === "habit" && !habit.habitId) return { ok: false, error: JOIN_ERRORS.habit };
  guard.current = true;
  const r = await submitJoin(code, habit, join);
  if (r.ok) onJoined(r.id);
  else guard.current = false;
  return r;
}

/** Calls `join`. Never throws: a failed call is an error message. */
export async function submitJoin(
  code: string,
  habit: GroupHabitChoice,
  join: GroupActions["join"],
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (habit.kind === "habit" && !habit.habitId) return { ok: false, error: JOIN_ERRORS.habit };
  try {
    const r = await join(code, habit);
    return r.ok ? { ok: true, id: r.data.id } : { ok: false, error: r.error };
  } catch {
    return { ok: false, error: JOIN_ERRORS.generic };
  }
}
