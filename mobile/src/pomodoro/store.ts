import { validatePomodoroConfig } from "@/domain/pomodoro";

const KEY = "kz-pomodoro-v1";
const MIN_MS = 60_000;

/** What is persisted: the start instant is the source of truth, everything else derives from it. */
type Stored = {
  v: 1;
  habitId: string;
  blockId: string;
  startedAt: number;
  durationMs: number;
  topic: string | null;
  notificationId: string | null;
  /** local day and zone when it started: the stale-day rule reads them when the block is credited */
  day: string;
  zone: string;
};

export type PomodoroDeps = {
  storage: { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void };
  scheduler: {
    schedule(input: { at: number; habitId: string; minutes: number }): Promise<string | null>;
    cancel(notificationId: string): Promise<void>;
  };
  now: () => number;
  newId: () => string;
};

export type PomodoroView =
  | { kind: "idle" }
  | { kind: "running"; habitId: string; minutes: number; remainingMs: number }
  | { kind: "finished"; habitId: string; minutes: number };

export type StartInput = { habitId: string; minutes: number; topic: string | null; day: string; zone: string };
export type PomodoroBlockToCredit = { habitId: string; blockId: string; minutes: number; endedAt: number; topic: string | null; day: string; zone: string };
export type StartResult = { ok: true } | { ok: false; error: string };
export type FinishResult = { ok: true; block: PomodoroBlockToCredit } | { ok: false; error: string };

export const ALREADY_RUNNING = "Ya hay un Pomodoro en marcha.";
export const TOO_SHORT = "Menos de un minuto: no hay nada que sumar.";

function parse(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<Stored>;
    const ok =
      s.v === 1 &&
      typeof s.habitId === "string" &&
      typeof s.blockId === "string" &&
      typeof s.startedAt === "number" &&
      typeof s.durationMs === "number" &&
      typeof s.day === "string" &&
      typeof s.zone === "string";
    return ok ? (s as Stored) : null;
  } catch {
    return null;
  }
}

/**
 * One focus timer, kept as `{startedAt, durationMs}` so the remaining time is recomputed from the clock on every
 * render and when the app returns to the foreground (never counted by ticks, which stop while it is backgrounded).
 * The end is also scheduled as a local notification, cancelled with the timer.
 */
export function createPomodoroStore(deps: PomodoroDeps) {
  const read = () => parse(deps.storage.get(KEY));

  function view(): PomodoroView {
    const s = read();
    if (!s) return { kind: "idle" };
    const minutes = Math.round(s.durationMs / MIN_MS);
    const remainingMs = s.startedAt + s.durationMs - deps.now();
    return remainingMs > 0 ? { kind: "running", habitId: s.habitId, minutes, remainingMs } : { kind: "finished", habitId: s.habitId, minutes };
  }

  async function start(input: StartInput): Promise<StartResult> {
    if (read()) return { ok: false, error: ALREADY_RUNNING };
    const valid = validatePomodoroConfig({ focusMin: input.minutes, breakMin: 0, cycles: null }, "timer");
    if (!valid.ok) return valid;
    const startedAt = deps.now();
    const durationMs = input.minutes * MIN_MS;
    const notificationId = await deps.scheduler.schedule({ at: startedAt + durationMs, habitId: input.habitId, minutes: input.minutes });
    const stored: Stored = {
      v: 1,
      habitId: input.habitId,
      blockId: deps.newId(),
      startedAt,
      durationMs,
      topic: input.topic,
      notificationId,
      day: input.day,
      zone: input.zone,
    };
    deps.storage.set(KEY, JSON.stringify(stored));
    return { ok: true };
  }

  async function clear(s: Stored) {
    deps.storage.remove(KEY);
    if (s.notificationId) await deps.scheduler.cancel(s.notificationId);
  }

  /** Discards the timer: nothing is credited. */
  async function cancel() {
    const s = read();
    if (s) await clear(s);
  }

  /**
   * Ends the timer and returns the block to credit: the full length when it ran out (ended at its real end, even if the
   * app only opened later), or the elapsed whole minutes when finished early. Under one minute there is nothing to credit.
   */
  async function finish(): Promise<FinishResult> {
    const s = read();
    if (!s) return { ok: false, error: TOO_SHORT };
    const now = deps.now();
    const end = s.startedAt + s.durationMs;
    const endedAt = Math.min(now, end);
    const minutes = Math.min(Math.round(s.durationMs / MIN_MS), Math.floor((endedAt - s.startedAt) / MIN_MS));
    await clear(s);
    if (minutes < 1) return { ok: false, error: TOO_SHORT };
    return { ok: true, block: { habitId: s.habitId, blockId: s.blockId, minutes, endedAt, topic: s.topic, day: s.day, zone: s.zone } };
  }

  return { view, start, cancel, finish };
}

export type PomodoroStore = ReturnType<typeof createPomodoroStore>;
