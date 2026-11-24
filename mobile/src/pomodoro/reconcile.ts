import {
  ACTION_REV_BUMP,
  EMPTY_SESSION,
  loadPomodoro,
  loadPrefs,
  loadSession,
  pomodoroBoxReducer,
  saveSession,
  savePomodoro,
  type KeyValueStorage,
  type PomodoroBox,
} from "@/lib/pomodoro-core";
import { flushPendingDetailed, reportLines, type Send } from "@/lib/pomodoro-sync";

export type ReconcileResult = { credited: boolean; retryable: boolean; lines: string[]; totalMinutes: number | null };

/**
 * Credits the blocks that finished while the app was killed or closed: every stored timer is settled to `now` (an expired
 * focus closes its block at its real end instant) and its pending blocks are sent by block id, so a repeat is harmless.
 * The server keeps its `block_expired` rule: a block of an earlier local day is refused and dropped with its copy. Trouble
 * keeps the block pending (`retryable`). A timer with nothing finished is not rewritten.
 */
export async function reconcilePendingBlocks(input: {
  storage: KeyValueStorage;
  habitIds: string[];
  send: Send;
  timeZone: string;
  now: number;
}): Promise<ReconcileResult> {
  const out: ReconcileResult = { credited: false, retryable: false, lines: [], totalMinutes: null };
  for (const habitId of input.habitIds) {
    const stored = loadPomodoro(habitId, input.storage, input.now);
    if (!stored) continue;
    let box: PomodoroBox = { s: stored, session: loadSession(habitId, input.storage) ?? EMPTY_SESSION };
    box = pomodoroBoxReducer(box, { type: "tick", at: input.now });
    if (box.s.pending.length === 0) {
      if (box.s.phase !== stored.phase) persist(habitId, box, input.storage);
      continue;
    }
    const topic = loadPrefs(habitId, input.storage).topic.trim() || null;
    const report = await flushPendingDetailed(box.s, input.send, topic, { timeZone: input.timeZone, now: input.now });
    for (const e of report.events) box = pomodoroBoxReducer(box, e);
    persist(habitId, box, input.storage);
    if (report.events.some((e) => e.type === "confirm")) out.credited = true;
    if (report.retryable > 0) out.retryable = true;
    if (report.totalMinutes !== null) out.totalMinutes = report.totalMinutes;
    out.lines.push(...reportLines(report));
  }
  return out;
}

function persist(habitId: string, box: PomodoroBox, storage: KeyValueStorage) {
  savePomodoro({ ...box.s, rev: box.s.rev + ACTION_REV_BUMP }, storage);
  saveSession(habitId, box.session, storage);
}
