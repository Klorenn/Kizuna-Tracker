import type { PomodoroEvent, PomodoroState } from "@/domain/pomodoro";
import { localDate } from "@/domain/dates";
import type { sendPomodoroBlock } from "@/app/(app)/registros/time-actions";

type Send = typeof sendPomodoroBlock;

// ---------------------------------------------------------------- the day a block counts for

/**
 * Study time is never backdated: a block counts only for the local day (profile zone) on which it
 * ended, and only when it is synced on that same day. True when `endedAt` falls on an earlier
 * local day than `now`. A clock moved backwards (now before endedAt) is never expired.
 */
export function blockIsExpired(endedAt: number, now: number, timeZone: string): boolean {
  const day = (t: number) => {
    try {
      return localDate(new Date(t), timeZone);
    } catch {
      return localDate(new Date(t), "UTC");
    }
  };
  return day(endedAt) < day(now);
}

export const EXPIRED_MESSAGE = "Un bloque terminó ayer y ya no se puede sumar.";

export function expiredMessage(count: number): string {
  return count === 1 ? EXPIRED_MESSAGE : `${count} bloques terminaron ayer y ya no se pueden sumar.`;
}

// ---------------------------------------------------------------- retry schedule

/** 1 s, 2 s, 4 s ... capped at 30 s; `failures` is the number of failed rounds so far (>= 1). */
export function backoffMs(failures: number): number {
  const n = Math.max(1, Math.floor(failures));
  return Math.min(30_000, 1000 * 2 ** (n - 1));
}

/**
 * Runs `run` now on `kick()`; while it reports work left (`true`) it runs again after the capped
 * exponential backoff. Calls made while a run is in progress are ignored. `stop()` cancels the timer.
 */
export function createRetryScheduler(opts: {
  run: () => Promise<boolean>;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}) {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let failures = 0;
  let timer: unknown = null;
  let running = false;
  let stopped = false;

  async function go(): Promise<void> {
    if (running || stopped) return;
    running = true;
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    let more = false;
    try {
      more = await opts.run();
    } catch {
      more = true;
    }
    running = false;
    if (stopped) return;
    if (more) {
      failures += 1;
      timer = setTimer(() => {
        timer = null;
        void go();
      }, backoffMs(failures));
    } else {
      failures = 0;
    }
  }

  return {
    kick: () => void go(),
    stop: () => {
      stopped = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
    failures: () => failures,
  };
}

// ---------------------------------------------------------------- sending

export type FlushReport = {
  /** `confirm` / `drop` per block that reached an answer; blocks still retryable produce nothing. */
  events: PomodoroEvent[];
  /** Blocks refused for good, with the copy to show ("... No guardamos 25 min."). */
  dropped: { blockId: string; minutes: number; message: string }[];
  /** Blocks removed because they ended on an earlier local day (never sent). */
  expired: number;
  /** The day's total after the last accepted block, when there was one. */
  totalMinutes: number | null;
  /** A block was saved but the server rejected its topic: the minutes counted, the topic did not. */
  topicRejected: boolean;
  /** Blocks that stay pending because of network or server trouble. */
  retryable: number;
  /** The session is gone: the blocks wait for the user to sign in again. */
  signedOut: boolean;
};

/** Block ids with a request on the wire (module-wide: every caller shares it). */
const inFlight = new Set<string>();

/**
 * Sends every pending block of a state once. A block already in flight is skipped, so two flushes
 * triggered together never send it twice (the server is idempotent anyway). With `day`, a block that
 * ended on an earlier local day is NOT sent: it is dropped and counted in `expired`. Accepted
 * (credited or already received) -> confirm; refused for good -> drop; trouble -> stays pending.
 */
export async function flushPendingDetailed(
  s: PomodoroState,
  send: Send,
  topic: string | null,
  day?: { timeZone: string; now: number },
): Promise<FlushReport> {
  const report: FlushReport = {
    events: [],
    dropped: [],
    expired: 0,
    totalMinutes: null,
    topicRejected: false,
    retryable: 0,
    signedOut: false,
  };
  const waiting = s.pending.filter((p) => !inFlight.has(p.blockId));
  const mine = waiting.filter((p) => {
    // a block without its end instant (older stored shape) cannot be placed on a day: expired
    if (!Number.isFinite(p.endedAt) || (day && blockIsExpired(p.endedAt, day.now, day.timeZone))) {
      report.events.push({ type: "drop", blockId: p.blockId });
      report.expired += 1;
      return false;
    }
    return true;
  });
  for (const p of mine) inFlight.add(p.blockId);
  type Answer = Awaited<ReturnType<Send>>;
  const attempt = async (p: (typeof mine)[number]): Promise<{ answer: Answer; topicRejected: boolean }> => {
    const call = async (t: string | null): Promise<Answer> => {
      try {
        return await send(s.habitId, { blockId: p.blockId, minutes: p.minutes, endedAt: p.endedAt }, t);
      } catch {
        return { ok: false, error: "", retry: true };
      }
    };
    let answer = await call(topic);
    let topicRejected = false;
    // a rejected topic must not cost the block: resend once without it
    if (!answer.ok && !answer.retry && answer.code === "invalid_topic" && topic !== null) {
      answer = await call(null);
      topicRejected = answer.ok;
    }
    return { answer, topicRejected };
  };
  const answers = await Promise.all(
    mine.map(async (p) => {
      try {
        return await attempt(p);
      } finally {
        inFlight.delete(p.blockId);
      }
    }),
  );
  answers.forEach(({ answer: a, topicRejected }, i) => {
    const p = mine[i];
    if (a.ok) {
      report.events.push({ type: "confirm", blockId: p.blockId });
      report.totalMinutes = a.totalMinutes;
      if (topicRejected) report.topicRejected = true;
    } else if (!a.retry) {
      report.events.push({ type: "drop", blockId: p.blockId });
      const message =
        a.code === "block_expired" ? a.error : `${a.error} No guardamos ${p.minutes} min.`;
      report.dropped.push({ blockId: p.blockId, minutes: p.minutes, message });
    } else {
      report.retryable += 1;
      if (a.code === "not_authenticated") report.signedOut = true;
    }
  });
  return report;
}

export async function flushPending(s: PomodoroState, send: Send, topic: string | null): Promise<PomodoroEvent[]> {
  return (await flushPendingDetailed(s, send, topic)).events;
}
