import type { Period } from "@/domain/challenges";
import { HABIT_ICONS, type IconKey } from "@/domain/presets";
import type { LocalDate } from "@/domain/types";
import {
  createSubline,
  habitDraftFromChallenge,
  habitKindLabel,
  sourceFromRow,
  type SourceHabitRow,
} from "@/lib/challenge-accept";
import { challengeFrequency, itemProgress, type ItemProgress, type ItemView } from "@/lib/challenge-view";

export type CardItem = {
  id: string;
  position: number;
  status: "proposed" | "active";
  /** "" while the player has not chosen a habit (an item the other proposed). */
  myHabit: string;
  theirHabit: string;
  /** null = daily */
  target: number | null;
  requiresPhoto: boolean;
  startsOn: LocalDate | null;
  pendingFor: "me" | "them" | null;
  /** Active items only, and only once the item counts in the running period. */
  progress: ItemProgress | null;
  /** Items I must answer: the proposer habit as it is shown, and the "Crear" option. */
  create: {
    habitIcon: IconKey;
    habitKind: string;
    createSubline: string;
    createSimple: boolean;
    sourceReadable: boolean;
  } | null;
};

export type HabitRow = SourceHabitRow & { id: string };

/** Every habit id referenced by items, both sides, once. */
export function itemHabitIds(items: { creator_habit_id: string | null; rival_habit_id: string | null }[]): string[] {
  return [...new Set(items.flatMap((i) => [i.creator_habit_id, i.rival_habit_id]).filter((x): x is string => !!x))];
}

/** The sub-retos of one challenge card, with names, progress and the "Crear" data of pending ones. */
export function buildCardItems(args: {
  items: ItemView[];
  frequencyType: "daily" | "weekly";
  habitById: Map<string, HabitRow>;
  /** The period running now (active challenges), null otherwise. */
  period: Period | null;
  datesOf: (habitId: string) => LocalDate[];
}): CardItem[] {
  const { items, frequencyType, habitById, period, datesOf } = args;
  return items.map((i): CardItem => {
    const mine = i.myHabitId ? habitById.get(i.myHabitId) : undefined;
    const theirs = i.theirHabitId ? habitById.get(i.theirHabitId) : undefined;
    let create: CardItem["create"] = null;
    if (i.pendingFor === "me") {
      const f = challengeFrequency({ frequency_type: frequencyType, target_per_week: i.target });
      const source = theirs ? sourceFromRow(theirs) : null;
      const { simpleFallback } = source
        ? habitDraftFromChallenge(source, { frequency: f, requiresPhoto: i.requiresPhoto })
        : { simpleFallback: false };
      create = {
        habitIcon: theirs && (HABIT_ICONS as readonly string[]).includes(theirs.icon) ? (theirs.icon as IconKey) : "target",
        habitKind: habitKindLabel(theirs?.log_type ?? "none"),
        createSubline: createSubline(f, i.requiresPhoto),
        createSimple: simpleFallback,
        sourceReadable: !!theirs,
      };
    }
    return {
      id: i.id,
      position: i.position,
      status: i.status,
      myHabit: i.myHabitId ? (mine?.name ?? "Hábito") : "",
      theirHabit: i.theirHabitId ? (theirs?.name ?? "Hábito") : "",
      target: i.target,
      requiresPhoto: i.requiresPhoto,
      startsOn: i.startsOn,
      pendingFor: i.pendingFor,
      progress: period ? itemProgress(i, frequencyType, period, datesOf) : null,
      create,
    };
  });
}
