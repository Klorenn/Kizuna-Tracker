import { periodsFor } from "@/domain/challenges";
import { challengeFrequency } from "@/lib/challenge-view";

type Named = { name: string | null } | null;

/** A `challenge_item_results` row with met = false and the failed item's habit names (viewer-readable only). */
export type FailedItemRow = {
  challenge_id: string;
  period_start: string;
  player_id: string;
  item: { creator_habit: Named; rival_habit: Named } | null;
};

export type ReasonChallenge = {
  creator_id: string;
  frequency_type: string;
  target_per_week: number | null;
  weeks: number;
  starts_on: string | null;
  creator_habit: Named;
  rival_habit: Named;
};

/**
 * "Agua, Gym · semana 2": the sub-retos the debtor failed in that period plus its position.
 * Periods closed before sub-retos have no result rows (or unreadable habits): the primary habit
 * of the challenge is named instead, as before.
 */
export function debtReason(
  d: { challenge_id: string; debtor_id: string; period_start: string },
  c: ReasonChallenge | undefined,
  failed: FailedItemRow[],
): string {
  if (!c) return "Reto";
  const debtorIsCreator = d.debtor_id === c.creator_id;
  const names = [
    ...new Set(
      failed
        .filter((r) => r.challenge_id === d.challenge_id && r.period_start === d.period_start && r.player_id === d.debtor_id)
        .map((r) => (debtorIsCreator ? r.item?.creator_habit?.name : r.item?.rival_habit?.name))
        .filter((n): n is string => !!n),
    ),
  ];
  const name = names.length > 0 ? names.join(", ") : (debtorIsCreator ? c.creator_habit?.name : c.rival_habit?.name) || "Reto";
  const f = challengeFrequency(c);
  const idx = c.starts_on ? periodsFor(c.starts_on, c.weeks, f).findIndex((p) => p.start === d.period_start) : -1;
  return idx === -1 ? name : `${name} · ${f.type === "weekly" ? "semana" : "día"} ${idx + 1}`;
}
