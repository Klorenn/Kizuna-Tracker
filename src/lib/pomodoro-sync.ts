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
 * exponential backoff. A kick made while a run is in progress is remembered and runs right after
 * that run (once, however many arrived): what asked for it may have missed the run in flight.
 * `stop()` cancels the timer and any queued kick.
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
  let queued = false;

  async function go(): Promise<void> {
    if (stopped) return;
    if (running) {
      queued = true;
      return;
    }
    running = true;
    queued = false;
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
    if (queued) {
      // someone asked while this run was going: run again at once (it decides about the backoff)
      if (more) failures += 1;
      void go();
      return;
    }
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
      queued = false;
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
  /** Blocks removed without being sent because they carry no end instant (older stored shape). */
  expired: number;
  /** The day's total after the last accepted block, when there was one. */
  totalMinutes: number | null;
  /** A block was saved but the server rejected its topic: the minutes counted, the topic did not. */
  topicRejected: boolean;
  /** Blocks that stay pending because of network or server trouble. */
  retryable: number;
  /** The session is gone: the blocks wait for the user to sign in again. */
  signedOut: boolean;
  /** The session check could not reach the server: the blocks wait and the copy says it could not connect. */
  unreachable: boolean;
  /** Blocks sent although their local day was over (the server decided; informational). */
  late: number;
};

/** The profile zone and the current instant: which local day a block still counts for. */
export type BlockDay = { timeZone: string; now: number };

/** Block ids with a request on the wire (module-wide: every caller shares it). */
const inFlight = new Set<string>();

export const SIGN_IN_MESSAGE = "Inicia sesión para guardar tus bloques.";
export const UNREACHABLE_MESSAGE = "No pudimos conectar. Inténtalo de nuevo en unos minutos.";
export const TOPIC_LOST_MESSAGE = "No guardamos el tema, pero sí los minutos.";

/** The lines to show for a flush: what expired, what was refused, and why blocks are waiting. */
export function reportLines(r: FlushReport): string[] {
  return [
    r.expired > 0 ? expiredMessage(r.expired) : null,
    ...r.dropped.map((d) => d.message),
    r.topicRejected ? TOPIC_LOST_MESSAGE : null,
    r.signedOut ? SIGN_IN_MESSAGE : null,
    r.unreachable ? UNREACHABLE_MESSAGE : null,
  ].filter((l): l is string => l !== null);
}

/**
 * Sends every pending block of a state once. A block already in flight is skipped, so two flushes
 * triggered together never send it twice (the server is idempotent anyway). `day` is required.
 * The server is the authority on expiry: a block whose local day is over is still sent once. If the
 * server already has its receipt it answers ok and the block is confirmed (credited earlier, nothing
 * is shown as lost); if it answers `block_expired` the block is dropped with the "terminó ayer" line;
 * trouble keeps it pending. Only a block without an end instant (older stored shape) cannot be sent
 * and is counted in `expired`. Accepted (credited or already received) -> confirm; refused for good
 * -> drop; trouble -> stays pending.
 */
export async function flushPendingDetailed(
  s: PomodoroState,
  send: Send,
  topic: string | null,
  day: BlockDay,
): Promise<FlushReport> {
  const report: FlushReport = {
    events: [],
    dropped: [],
    expired: 0,
    totalMinutes: null,
    topicRejected: false,
    retryable: 0,
    signedOut: false,
    unreachable: false,
    late: 0,
  };
  const waiting = s.pending.filter((p) => !inFlight.has(p.blockId));
  const mine = waiting.filter((p) => {
    // a block without its end instant (older stored shape) cannot be sent: the server needs it
    if (!Number.isFinite(p.endedAt)) {
      report.events.push({ type: "drop", blockId: p.blockId });
      report.expired += 1;
      return false;
    }
    return true;
  });
  report.late = mine.filter((p) => blockIsExpired(p.endedAt, day.now, day.timeZone)).length;
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
      if (a.code === "session_unavailable") report.unreachable = true;
    }
  });
  return report;
}

export async function flushPending(
  s: PomodoroState,
  send: Send,
  topic: string | null,
  day: BlockDay,
): Promise<PomodoroEvent[]> {
  return (await flushPendingDetailed(s, send, topic, day)).events;
}
