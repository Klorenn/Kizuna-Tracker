import { formatDuration } from "@/domain/time";
import type { LocalDate } from "@/domain/types";
import { episodeLabel, type MediaKind } from "@/domain/watch";

// Pure text and link helpers of the detailed logs. They import only domain code (no database
// client, no server code), so client components such as the calendar day sheet can use them
// without pulling the loaders of `logs-data` into their chunk.

/** The entry screens of each kind (quantity has none: its sums are added from Hoy). */
const ENTRY_PATH = {
  reading: "lectura",
  workout: "entrenamiento",
  time: "tiempo",
  watch: "visto",
  cardio: "distancia",
} as const;

export type EntryLogType = keyof typeof ENTRY_PATH;

/** Where to add or edit the log of a habit on a day (pages owned by the entry screens). */
export function logEntryHref(habitId: string, logType: EntryLogType, date: LocalDate): string {
  return `/habitos/${habitId}/${ENTRY_PATH[logType]}?fecha=${date}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "1 h 25 min · Álgebra · 2 pomodoros": the time log of a day in one line. */
export function timeLine(log: { kind?: "time"; minutes: number; topic: string | null; pomodoros: number }): string {
  const parts = [formatDuration(log.minutes)];
  if (log.topic) parts.push(log.topic);
  if (log.pomodoros > 0) parts.push(plural(log.pomodoros, "pomodoro", "pomodoros"));
  return parts.join(" · ");
}

/** "Dark · 3 episodios · T1 E6", "Dune · Completa · 2 h 35 min", "Past Lives · 1 h 10 min". */
export function watchLine(log: {
  kind?: "watch";
  title: string;
  mediaKind: MediaKind;
  episodes: number | null;
  season: number | null;
  episodeTo: number | null;
  minutes: number;
  completed: boolean;
}): string {
  const parts = [log.title];
  if (log.mediaKind === "series") {
    if (log.episodes !== null) parts.push(plural(log.episodes, "episodio", "episodios"));
    const at = episodeLabel(log.season, log.episodeTo);
    if (at) parts.push(at);
    return parts.join(" · ");
  }
  if (log.completed) parts.push("Completa");
  if (log.minutes > 0) parts.push(formatDuration(log.minutes));
  return parts.join(" · ");
}
