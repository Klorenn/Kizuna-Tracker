import { monthTitle, shiftMonth, type MonthKey } from "@/domain/calendar";
import { formatKg1, formatSignedKg1, latestWeight, monthlyWeightChange, type WeightEntry } from "@/domain/body";
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
  key: "books" | "pages" | "visits" | "group" | "weight";
  label: string;
  value: string;
  caption: string;
  href: string;
  private?: boolean;
};

const count = (n: number) => String(n);

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

  const latest = latestWeight(weights);
  if (latest) {
    const change = monthlyWeightChange(weights, month);
    cards.push({
      key: "weight",
      label: "Peso",
      value: formatKg1(latest.kg),
      caption: `Este mes: ${change === null ? "sin cambio" : formatSignedKg1(change)}`,
      href: "/resumen/peso",
      private: true,
    });
  }
  return cards;
}
