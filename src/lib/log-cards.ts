import { dayLabel, monthTitle, shiftMonth, type MonthKey } from "@/domain/calendar";
import { formatKg1, formatSignedKg1, latestWeight, monthlyWeightChange, type WeightEntry } from "@/domain/body";
import { CARDIO_KINDS, CARDIO_KIND_LABEL, formatDistance, monthlyCardio, type CardioEntry, type CardioKind } from "@/domain/cardio";
import { formatAmount, monthlyQuantity, type QuantityConfig, type QuantityEntry } from "@/domain/quantity";
import { formatDuration, monthlyTime, type TimeEntry } from "@/domain/time";
import { monthlyWatch, type MediaItem, type WatchEntry } from "@/domain/watch";
import {
  DAY_TYPE_LABEL,
  formatSignedKg,
  groupDeltas,
  gymVisits,
  headlineGroup,
  monthlyReading,
  type Book,
  type ExerciseRef,
  type ReadingEntry,
  type WorkoutSet,
} from "@/domain/logs";
import type { LocalDate } from "@/domain/types";

/** One tappable card of Resumen > REGISTROS (rendered by `LogMonthCards`). */
export type LogCard = {
  key: "books" | "pages" | "visits" | "group" | "weight" | "time" | "movies" | "episodes" | "quantity" | "cardio";
  label: string;
  value: string;
  caption: string;
  href: string;
  private?: boolean;
};

const count = (n: number) => String(n);

/** At most this many quantity habits get their own card. */
const MAX_QUANTITY_CARDS = 3;

/**
 * The activity the distance card is about: the one kind all the outings share ("Trote"),
 * otherwise a generic "Distancia" measured in km (a swim alone stays in metres).
 */
export function cardioKind(entries: CardioEntry[]): { kind: CardioKind; label: string } {
  const kinds = CARDIO_KINDS.filter((k) => entries.some((e) => e.kind === k));
  if (kinds.length === 1) return { kind: kinds[0], label: CARDIO_KIND_LABEL[kinds[0]] };
  if (kinds.length === 0) return { kind: "run", label: CARDIO_KIND_LABEL.run };
  return { kind: "run", label: "Distancia" };
}

/**
 * The REGISTROS cards of `month`: reading cards when there is reading data (or a reading
 * habit), gym cards likewise, and the private weight card when there are weigh-ins. Each card
 * carries last month's value in small type.
 */
export function buildLogCards(input: {
  month: MonthKey;
  reading: { books: Book[]; entries: ReadingEntry[] } | null;
  workout: { exercises: ExerciseRef[]; sets: WorkoutSet[] } | null;
  visits: LocalDate[] | null;
  weights: WeightEntry[];
  /** The newest weigh-in ever, when it may be older than the `weights` window. */
  latestWeight?: WeightEntry | null;
  /** Present (even empty) when the user has a `time` habit. */
  time?: TimeEntry[] | null;
  /** Present when the user has a `watch` habit. */
  watch?: { media: MediaItem[]; entries: WatchEntry[] } | null;
  /** One per `quantity` habit, in creation order: only the first three get a card. */
  quantity?: {
    habitId: string;
    name: string;
    config: QuantityConfig;
    entries: QuantityEntry[];
    doneDates: LocalDate[];
  }[] | null;
  /** Present when the user has a `cardio` habit. */
  cardio?: CardioEntry[] | null;
}): LogCard[] {
  const { month, reading, workout, visits, weights } = input;
  const prev = shiftMonth(month, -1);
  const prevName = monthTitle(prev).name;
  const cards: LogCard[] = [];

  if (reading) {
    const now = monthlyReading(reading.entries, reading.books, month);
    const before = monthlyReading(reading.entries, reading.books, prev);
    cards.push(
      {
        key: "books",
        label: "Libros terminados",
        value: count(now.booksFinished.length),
        caption: `${prevName}: ${before.booksFinished.length}`,
        href: "/resumen/lectura",
      },
      {
        key: "pages",
        label: "Páginas",
        value: count(now.pages),
        caption: `${prevName}: ${before.pages}`,
        href: "/resumen/lectura",
      },
    );
  }

  if (workout) {
    const dates = visits ?? [];
    cards.push({
      key: "visits",
      label: "Visitas al gym",
      value: count(gymVisits(dates, month)),
      caption: `${prevName}: ${gymVisits(dates, prev)}`,
      href: "/resumen/gimnasio",
    });
    const head = headlineGroup(workout.sets, workout.exercises, month);
    if (head) {
      const before = groupDeltas(workout.sets, workout.exercises, prev).find((g) => g.group === head.group);
      cards.push({
        key: "group",
        label: DAY_TYPE_LABEL[head.group],
        value: head.deltaKg === null ? "—" : formatSignedKg(head.deltaKg),
        caption: `${prevName}: ${before?.deltaKg == null ? "sin comparación" : formatSignedKg(before.deltaKg)}`,
        href: `/resumen/gimnasio/${head.group}`,
      });
    } else {
      cards.push({
        key: "group",
        label: "Kg por grupo",
        value: "—",
        caption: "Sin series este mes",
        href: "/resumen/gimnasio",
      });
    }
  }

  const q = `?mes=${month}`;

  if (input.time) {
    const now = monthlyTime(input.time, month).minutes;
    cards.push({
      key: "time",
      label: "Tiempo",
      value: formatDuration(now),
      caption: `${prevName}: ${formatDuration(monthlyTime(input.time, prev).minutes)}`,
      href: `/resumen/tiempo${q}`,
    });
  }

  if (input.watch) {
    const now = monthlyWatch(input.watch.entries, input.watch.media, month);
    const before = monthlyWatch(input.watch.entries, input.watch.media, prev);
    const href = `/resumen/series${q}`;
    cards.push(
      { key: "movies", label: "Películas", value: count(now.movies), caption: `${prevName}: ${before.movies}`, href },
      { key: "episodes", label: "Episodios", value: count(now.episodes), caption: `${prevName}: ${before.episodes}`, href },
    );
  }

  for (const h of (input.quantity ?? []).slice(0, MAX_QUANTITY_CARDS)) {
    const now = monthlyQuantity(h.entries, h.doneDates, month, h.config);
    const before = monthlyQuantity(h.entries, h.doneDates, prev, h.config);
    const perDay = (m: { days: number; average: number }) => (m.days === 0 ? "—" : `${formatAmount(m.average, h.config)}/día`);
    cards.push({
      key: "quantity",
      label: h.name,
      value: perDay(now),
      caption: `${prevName}: ${perDay(before)}`,
      href: `/resumen/cantidad/${h.habitId}${q}`,
    });
  }

  if (input.cardio) {
    const kind = cardioKind(input.cardio);
    const now = monthlyCardio(input.cardio, month);
    const before = monthlyCardio(input.cardio, prev);
    cards.push({
      key: "cardio",
      label: kind.label,
      value: formatDistance(now.distanceM, kind.kind),
      caption: `${prevName}: ${formatDistance(before.distanceM, kind.kind)}`,
      href: `/resumen/distancia${q}`,
    });
  }

  const latest = latestWeight(weights) ?? input.latestWeight ?? null;
  if (latest) {
    const change = weights.length > 0 ? monthlyWeightChange(weights, month) : null;
    const stale = weights.length === 0;
    const year = latest.date.slice(0, 4);
    cards.push({
      key: "weight",
      label: "Peso",
      value: formatKg1(latest.kg),
      caption: stale
        ? `Último registro: ${dayLabel(latest.date)} de ${year}`
        : `Este mes: ${change === null ? "sin datos suficientes" : formatSignedKg1(change)}`,
      href: "/resumen/peso",
      private: true,
    });
  }
  return cards;
}
