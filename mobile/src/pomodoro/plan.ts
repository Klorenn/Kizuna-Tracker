import { STOPWATCH_CAP_MESSAGE, STOPWATCH_CAP_MIN, type PomodoroState } from "@/domain/pomodoro";
import { blockEndText } from "@/lib/pomodoro-copy";

const MIN_MS = 60_000;

export type PlannedNotification = { at: number; title: string; body: string };
export type NotificationPlan = {
  items: PlannedNotification[];
  /** Changes only when an end instant or kind changes: a tick never reschedules, a pause or a resume does. */
  sig: string;
};

/**
 * The local notifications a running timer needs, derived from its state (never stored): one per phase end. A Pomodoro
 * focus also plans the break end that follows it, because the break starts by itself at that instant even if the app
 * was killed. Paused, idle, ready and done plan nothing; an instant already past is skipped.
 */
export function planNotifications(s: PomodoroState, habitName: string, now: number): NotificationPlan | null {
  if ((s.phase !== "focus" && s.phase !== "break") || s.phaseStartedAt === null || s.pausedAt !== null) return null;
  const start = s.phaseStartedAt + s.pausedMs;
  const items: PlannedNotification[] = [];
  if (s.mode === "stopwatch") {
    items.push({ at: start + STOPWATCH_CAP_MIN * MIN_MS, title: "Cronómetro detenido", body: STOPWATCH_CAP_MESSAGE });
  } else if (s.phase === "focus") {
    const end = start + s.config.focusMin * MIN_MS;
    const lastRound = s.mode !== "pomodoro" || (s.config.cycles !== null && s.cycle >= s.config.cycles);
    items.push({ at: end, ...blockEndText({ kind: "focus", habitName, minutes: s.config.focusMin, lastRound }) });
    if (!lastRound) items.push({ at: end + s.config.breakMin * MIN_MS, ...blockEndText({ kind: "break", habitName }) });
  } else {
    items.push({ at: start + s.config.breakMin * MIN_MS, ...blockEndText({ kind: "break", habitName }) });
  }
  const future = items.filter((i) => i.at > now);
  if (future.length === 0) return null;
  return { items: future, sig: future.map((i) => `${i.at}:${i.title}`).join("|") };
}
