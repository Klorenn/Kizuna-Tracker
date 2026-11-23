import type { PomodoroEvent, PomodoroState } from "@/domain/pomodoro";
import type { sendPomodoroBlock } from "@/app/(app)/registros/time-actions";

type Send = typeof sendPomodoroBlock;

export type FlushReport = {
  /** `confirm` / `drop` per block that reached an answer; blocks still retryable produce nothing. */
  events: PomodoroEvent[];
  /** Blocks the server refused for good, with the copy to show ("... No guardamos 25 min."). */
  dropped: { blockId: string; minutes: number; message: string }[];
  /** The day's total after the last accepted block, when there was one. */
  totalMinutes: number | null;
};

/** Block ids with a request on the wire (module-wide: every caller and tab-less re-render shares it). */
const inFlight = new Set<string>();

/**
 * Sends every pending block of a state once. A block already in flight is skipped, so two flushes
 * triggered together (mount + online + visible) never send it twice; the server is idempotent
 * anyway. Accepted (credited or already received) -> confirm; refused for good -> drop; network
 * trouble -> nothing, it stays pending for the next flush.
 */
export async function flushPendingDetailed(s: PomodoroState, send: Send, topic: string | null): Promise<FlushReport> {
  const mine = s.pending.filter((p) => !inFlight.has(p.blockId));
  for (const p of mine) inFlight.add(p.blockId);
  const answers = await Promise.all(
    mine.map(async (p) => {
      try {
        return await send(s.habitId, { blockId: p.blockId, minutes: p.minutes }, topic);
      } catch {
        return { ok: false as const, error: "", retry: true };
      } finally {
        inFlight.delete(p.blockId);
      }
    }),
  );
  const report: FlushReport = { events: [], dropped: [], totalMinutes: null };
  answers.forEach((a, i) => {
    const p = mine[i];
    if (a.ok) {
      report.events.push({ type: "confirm", blockId: p.blockId });
      report.totalMinutes = a.totalMinutes;
    } else if (!a.retry) {
      report.events.push({ type: "drop", blockId: p.blockId });
      report.dropped.push({ blockId: p.blockId, minutes: p.minutes, message: `${a.error} No guardamos ${p.minutes} min.` });
    }
  });
  return report;
}

export async function flushPending(s: PomodoroState, send: Send, topic: string | null): Promise<PomodoroEvent[]> {
  return (await flushPendingDetailed(s, send, topic)).events;
}
