import { initialPomodoro, pomodoroReducer, type PomodoroConfig, type PomodoroEvent, type TimerMode } from "@/domain/pomodoro";
import {
  configFor,
  EMPTY_SESSION,
  loadPomodoro,
  loadPrefs,
  loadSession,
  pomodoroBoxReducer,
  reconcileSession,
  saveSession,
  savePomodoro,
  sessionAfter,
  type KeyValueStorage,
  type PomodoroAction,
  type PomodoroBox,
} from "@/lib/pomodoro-core";
import { flushPendingDetailed, reportLines, type Send } from "@/lib/pomodoro-sync";
import { planNotifications } from "./plan";

export type EngineDeps = {
  habitId: string;
  habitName: string;
  storage: KeyValueStorage;
  scheduler: {
    schedule(input: { at: number; habitId: string; title: string; body: string; silent?: boolean }): Promise<string | null>;
    cancel(notificationId: string): Promise<void>;
  };
  now: () => number;
  newId: () => string;
};

export type FlushResult = { lines: string[]; retryable: boolean; credited: boolean; totalMinutes: number | null };

const notifKey = (habitId: string) => `kizuna:pomodoro:notif:${habitId}`;
type NotifRecord = { sig: string; ids: (string | null)[] };

/**
 * The native Pomodoro of one habit: the web's pure reducer (rounds, breaks, pause, timer, stopwatch) over a storage, plus
 * one scheduled local notification per phase end, kept in step with the state (paused or stopped = cancelled, resumed =
 * rescheduled at the moved end). State is persisted on every change, so a killed app resumes from the stored instants.
 */
export function createPomodoroEngine(deps: EngineDeps) {
  const { habitId, storage } = deps;
  let box: PomodoroBox = { s: initialPomodoro(habitId, loadPrefs(habitId, storage).config), session: EMPTY_SESSION };
  let savedSession = box.session;
  let queue: Promise<void> = Promise.resolve();
  let habitName = deps.habitName;

  const persist = (prev: PomodoroBox | null) => {
    if (prev === null || box.s.rev !== prev.s.rev || box.s !== prev.s) savePomodoro(box.s, storage);
    if (box.session !== savedSession) {
      savedSession = box.session;
      saveSession(habitId, box.session, storage);
    }
  };

  const readRecord = (): NotifRecord | null => {
    try {
      return JSON.parse(storage.getItem(notifKey(habitId)) ?? "null") as NotifRecord | null;
    } catch {
      return null;
    }
  };

  async function syncNotifications(): Promise<void> {
    const plan = planNotifications(box.s, habitName, deps.now());
    const silent = loadPrefs(habitId, storage).muted;
    const sig = plan ? `${plan.sig}${silent ? "|silent" : ""}` : "";
    const rec = readRecord();
    if (plan && rec?.sig === sig) return;
    for (const id of rec?.ids ?? []) if (id) await deps.scheduler.cancel(id);
    if (!plan) {
      if (rec) storage.removeItem(notifKey(habitId));
      return;
    }
    const ids: (string | null)[] = [];
    for (const it of plan.items) ids.push(await deps.scheduler.schedule({ at: it.at, habitId, title: it.title, body: it.body, silent }));
    storage.setItem(notifKey(habitId), JSON.stringify({ sig, ids } satisfies NotifRecord));
  }
  const sync = () => {
    queue = queue.then(syncNotifications, syncNotifications).catch(() => undefined);
  };

  function dispatch(a: PomodoroAction): PomodoroBox {
    const prev = box;
    box = pomodoroBoxReducer(box, a);
    if (box !== prev) {
      persist(prev);
      sync();
    }
    return box;
  }

  const at = () => deps.now();
  const act = {
    start: () => dispatch({ type: "start", at: at(), blockId: deps.newId(), blockIds: [deps.newId(), deps.newId(), deps.newId()] }),
    pause: () => dispatch({ type: "pause", at: at() }),
    resume: () => dispatch({ type: "resume", at: at() }),
    skip: () => dispatch({ type: "skip", at: at(), blockId: deps.newId() }),
    finish: () => dispatch({ type: "finish", at: at() }),
    reset: () => dispatch({ type: "reset" }),
    tick: () => dispatch({ type: "tick", at: at() }),
    configure: (config: PomodoroConfig, mode?: TimerMode) => dispatch({ type: "configure", config, mode }),
    setMode: (mode: TimerMode, config: PomodoroConfig) => dispatch({ type: "setMode", mode, config }),
  };

  return {
    /** Reads what is stored (settling whatever ended while the app was away) and syncs the notifications. */
    load(): PomodoroBox {
      const now = at();
      const prefs = loadPrefs(habitId, storage);
      const stored = loadPomodoro(habitId, storage, now);
      const tally = loadSession(habitId, storage);
      savedSession = tally;
      if (stored) {
        const s = pomodoroReducer(stored, { type: "tick", at: now });
        box = { s, session: sessionAfter(stored, s, reconcileSession(stored, tally)) };
      } else {
        box = { s: initialPomodoro(habitId, configFor(prefs.mode, prefs), prefs.mode), session: tally };
      }
      persist(null);
      sync();
      return box;
    },
    get: (): PomodoroBox => box,
    act,
    /** Sends every pending block (idempotent by block id) and applies the answers; the server keeps the `block_expired` rule. */
    async flush(send: Send, topic: string | null, timeZone: string): Promise<FlushResult> {
      const s = box.s;
      if (s.pending.length === 0) return { lines: [], retryable: false, credited: false, totalMinutes: null };
      const report = await flushPendingDetailed(s, send, topic, { timeZone, now: at() });
      for (const e of report.events as PomodoroEvent[]) dispatch(e);
      return {
        lines: reportLines(report),
        retryable: report.retryable > 0,
        credited: report.events.some((e) => e.type === "confirm"),
        totalMinutes: report.totalMinutes,
      };
    },
    /** Re-plans the notifications after something outside the state changed (the mute preference). */
    resync: sync,
    setHabitName(name: string) {
      habitName = name;
    },
    /** Resolves when the notification bookkeeping of every change so far is done. */
    settled: () => queue,
  };
}

export type PomodoroEngine = ReturnType<typeof createPomodoroEngine>;
