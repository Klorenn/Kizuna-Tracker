import {
  initialPomodoro,
  parsePomodoroState,
  pomodoroReducer,
  POMODORO_PRESETS,
  validatePomodoroConfig,
  type PomodoroConfig,
  type PomodoroEvent,
  type PomodoroState,
  type TimerMode,
} from "@/domain/pomodoro";

// The storage-agnostic half of the Pomodoro store: keys, load/save with the `rev` rule, preferences, the session
// tally and the hook's reducer. It only needs a `KeyValueStorage` (the browser's `Storage` is one; the native app
// passes an MMKV adapter), no `window`, no React. The web store (pomodoro-store.ts) re-exports all of it.

/** The three calls the timer needs from any key-value storage. `Storage` satisfies it. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const POMODORO_PREFIX = "kizuna:pomodoro:";
const PREFIX = POMODORO_PREFIX;
/** Resting states untouched for this long start over as idle. */
const STALE_MS = 24 * 60 * 60 * 1000;

/**
 * A user action (pause, skip, start...) outranks any number of tick refreshes another tab can
 * write meanwhile: both start at the same `rev`, the action lands this much higher, so the
 * `rev` comparison (adopt only a higher one) keeps the pause instead of losing it.
 */
export const ACTION_REV_BUMP = 1000;
/**
 * The page counts as alive while its ticks are at most this far apart. Background tabs are
 * throttled to about one tick a minute; a sleeping laptop leaves hours.
 */
const LIVE_GAP_MS = 2 * 60_000;

/**
 * Did the page witness this phase end? True when its previous tick came before the end and no
 * more than `LIVE_GAP_MS` ago, so a block that ended in a throttled background tab still beeps
 * and notifies, while one found after sleep or a closed tab only updates the screen.
 */
export function isFreshEnd(prevTickAt: number | null, endedAt: number, at: number): boolean {
  return prevTickAt !== null && prevTickAt <= endedAt && at - prevTickAt <= LIVE_GAP_MS;
}

export const stateKey = (habitId: string) => `${PREFIX}${habitId}`;
export const prefsKey = (habitId: string) => `${PREFIX}config:${habitId}`;
export const sessionKey = (habitId: string) => `${PREFIX}session:${habitId}`;

/** idle / ready / done untouched for 24 h come back as idle (same config, unsent blocks kept). */
function settleStale(s: PomodoroState, now: number): PomodoroState {
  if (s.phase !== "idle" && s.phase !== "ready" && s.phase !== "done") return s;
  const ref = s.lastTickAt ?? s.phaseStartedAt;
  if (ref === null || now - ref <= STALE_MS) return s;
  return { ...initialPomodoro(s.habitId, s.config, s.mode), pending: s.pending, rev: s.rev };
}


export function loadPomodoro(habitId: string, storage: KeyValueStorage, now: number = Date.now()): PomodoroState | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(stateKey(habitId));
  } catch {
    return null;
  }
  if (raw === null) return null;
  const s = parsePomodoroState(raw);
  if (!s || s.habitId !== habitId) {
    try {
      storage.removeItem(stateKey(habitId));
    } catch {
      // ignore
    }
    return null;
  }
  return settleStale(s, now);
}

/** False when the device refused the write (the timer keeps working in memory). */
export function savePomodoro(s: PomodoroState, storage: KeyValueStorage): boolean {
  try {
    storage.setItem(stateKey(s.habitId), JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-reads before writing: a state that another tab already outranked (higher `rev`) is not
 * written and comes back as `remote` so the caller adopts it instead of clobbering it.
 */
export function savePomodoroIfNewer(
  s: PomodoroState,
  storage: KeyValueStorage,
): { status: "saved" | "failed" } | { status: "stale"; remote: PomodoroState } {
  let remote: PomodoroState | null = null;
  try {
    remote = parsePomodoroState(storage.getItem(stateKey(s.habitId)));
  } catch {
    // unreadable: write anyway
  }
  if (remote && remote.rev > s.rev) return { status: "stale", remote };
  return { status: savePomodoro(s, storage) ? "saved" : "failed" };
}

/** Pending blocks of a habit the timer can no longer serve (archived, deleted, other log type): drop them. */
export function discardPending(habitId: string, storage: KeyValueStorage, now: number = Date.now()): number {
  const s = loadPomodoro(habitId, storage, now);
  if (!s || s.pending.length === 0) return 0;
  let next = s;
  for (const p of s.pending) next = pomodoroReducer(next, { type: "drop", blockId: p.blockId });
  savePomodoro({ ...next, rev: next.rev + ACTION_REV_BUMP }, storage);
  return s.pending.length;
}

/** The state of another tab, only when it is newer than `currentRev`. */
export function adoptRemote(currentRev: number, raw: string | null): PomodoroState | null {
  const s = parsePomodoroState(raw);
  return s && s.rev > currentRev ? s : null;
}

// ---------------------------------------------------------------- preferences and session tally

export type PomodoroPresetKey = (typeof POMODORO_PRESETS)[number]["key"] | "custom";
export type PomodoroPrefs = {
  preset: PomodoroPresetKey;
  config: PomodoroConfig;
  topic: string;
  muted: boolean;
  /** The last mode used on this habit: the screen opens on it. */
  mode: TimerMode;
  /** The minutes of the countdown timer (the pomodoro keeps its own focus length in `config`). */
  timerMin: number;
  /** Remembered so Hoy can name a habit whose blocks are stuck even after it was archived. */
  habitName: string;
};

export const DEFAULT_POMODORO_PREFS: PomodoroPrefs = {
  preset: "25-5",
  config: { focusMin: 25, breakMin: 5, cycles: 4 },
  topic: "",
  muted: false,
  mode: "pomodoro",
  timerMin: 25,
  habitName: "",
};

/** The configuration a mode starts with: the timer takes its minutes from the prefs, the others keep theirs. */
export const configFor = (mode: TimerMode, p: PomodoroPrefs): PomodoroConfig =>
  mode === "timer" ? { ...p.config, focusMin: p.timerMin } : p.config;

export function loadPrefs(habitId: string, storage: KeyValueStorage): PomodoroPrefs {
  try {
    const raw = storage.getItem(prefsKey(habitId));
    if (raw === null) return DEFAULT_POMODORO_PREFS;
    const d = JSON.parse(raw) as Partial<PomodoroPrefs> | null;
    if (!d || typeof d !== "object" || !d.config || !validatePomodoroConfig(d.config).ok) return DEFAULT_POMODORO_PREFS;
    const preset: PomodoroPresetKey =
      d.preset === "custom" || POMODORO_PRESETS.some((p) => p.key === d.preset) ? (d.preset as PomodoroPresetKey) : "custom";
    return {
      preset,
      config: { focusMin: d.config.focusMin, breakMin: d.config.breakMin, cycles: d.config.cycles },
      topic: typeof d.topic === "string" ? d.topic.slice(0, 60) : "",
      muted: d.muted === true,
      mode: d.mode === "timer" || d.mode === "stopwatch" ? d.mode : "pomodoro",
      timerMin: Number.isInteger(d.timerMin) && (d.timerMin as number) >= 1 && (d.timerMin as number) <= 90 ? (d.timerMin as number) : 25,
      habitName: typeof d.habitName === "string" ? d.habitName.slice(0, 80) : "",
    };
  } catch {
    return DEFAULT_POMODORO_PREFS;
  }
}

export function savePrefs(habitId: string, prefs: PomodoroPrefs, storage: KeyValueStorage): void {
  try {
    storage.setItem(prefsKey(habitId), JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

/**
 * What this session has produced: blocks that closed, their minutes, and the last block with what
 * the server said about it (so "Sumamos N min" shows only after a confirmation).
 */
export type PomodoroSession = {
  blocks: number;
  minutes: number;
  last: number;
  lastId: string | null;
  lastStatus: "pending" | "confirmed" | "dropped" | null;
};
export const EMPTY_SESSION: PomodoroSession = { blocks: 0, minutes: 0, last: 0, lastId: null, lastStatus: null };

/** Updates the tally across one reducer step. A new session (idle/done -> focus) starts from zero. */
export function sessionAfter(prev: PomodoroState, next: PomodoroState, session: PomodoroSession): PomodoroSession {
  if ((prev.phase === "idle" || prev.phase === "done") && next.phase === "focus") return EMPTY_SESSION;
  if (next === prev) return session;
  let out = session;
  const nextIds = new Set(next.pending.map((p) => p.blockId));
  for (const gone of prev.pending.filter((p) => !nextIds.has(p.blockId))) {
    if (gone.blockId === out.lastId) {
      out = { ...out, lastStatus: next.credited > prev.credited ? "confirmed" : "dropped" };
    }
  }
  const known = new Set(prev.pending.map((p) => p.blockId));
  const fresh = next.pending.filter((p) => !known.has(p.blockId));
  if (fresh.length > 0) {
    const last = fresh[fresh.length - 1];
    out = {
      blocks: out.blocks + fresh.length,
      minutes: out.minutes + fresh.reduce((sum, p) => sum + p.minutes, 0),
      last: last.minutes,
      lastId: last.blockId,
      lastStatus: "pending",
    };
  }
  return out;
}

/**
 * Hoy's banner can confirm or drop a block while the screen is closed. When the screen comes back
 * and the last block is no longer pending, settle its status from what the state says.
 */
export function reconcileSession(s: PomodoroState, session: PomodoroSession): PomodoroSession {
  if (session.lastStatus !== "pending" || session.lastId === null) return session;
  if (s.pending.some((p) => p.blockId === session.lastId)) return session;
  return { ...session, lastStatus: s.credited > 0 ? "confirmed" : "dropped" };
}

export function loadSession(habitId: string, storage: KeyValueStorage): PomodoroSession {
  try {
    const d = JSON.parse(storage.getItem(sessionKey(habitId)) ?? "null") as Partial<PomodoroSession> | null;
    if (d && Number.isInteger(d.blocks) && Number.isInteger(d.minutes) && Number.isInteger(d.last)) {
      const status = d.lastStatus === "pending" || d.lastStatus === "confirmed" || d.lastStatus === "dropped" ? d.lastStatus : null;
      return {
        blocks: d.blocks as number,
        minutes: d.minutes as number,
        last: d.last as number,
        lastId: typeof d.lastId === "string" ? d.lastId : null,
        lastStatus: status,
      };
    }
  } catch {
    // ignore
  }
  return EMPTY_SESSION;
}

export function saveSession(habitId: string, session: PomodoroSession, storage: KeyValueStorage): boolean {
  try {
    storage.setItem(sessionKey(habitId), JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export type PomodoroBox = { s: PomodoroState; session: PomodoroSession };
type Box = PomodoroBox;
export type PomodoroAction =
  | PomodoroEvent
  | { type: "hydrate"; box: Box }
  | { type: "adopt"; state: PomodoroState }
  | { type: "configure"; config: PomodoroConfig; mode?: TimerMode }
  | { type: "setMode"; mode: TimerMode; config: PomodoroConfig };
type Action = PomodoroAction;

/**
 * The hook's reducer. Ticks keep the domain's `rev + 1`; every other change (a user action, a
 * server answer, a new configuration) lands `ACTION_REV_BUMP` higher, so when two tabs write at the
 * same `rev` the user's pause outranks the other tab's tick refresh.
 */
export function pomodoroBoxReducer(box: Box, a: Action): Box {
  switch (a.type) {
    case "hydrate":
      return a.box;
    case "adopt":
      return a.state.rev > box.s.rev ? { s: a.state, session: box.session } : box;
    case "configure": {
      if (box.s.phase !== "idle") return box;
      const s: PomodoroState = {
        ...initialPomodoro(box.s.habitId, a.config, a.mode ?? box.s.mode),
        pending: box.s.pending,
        rev: box.s.rev + ACTION_REV_BUMP,
      };
      return { s, session: box.session };
    }
    case "setMode": {
      // the mode changes only while nothing runs (idle or done); unsent blocks stay
      if (box.s.phase !== "idle" && box.s.phase !== "done") return box;
      const s: PomodoroState = {
        ...initialPomodoro(box.s.habitId, a.config, a.mode),
        pending: box.s.pending,
        rev: box.s.rev + ACTION_REV_BUMP,
      };
      return { s, session: box.session };
    }
    default: {
      const stepped = pomodoroReducer(box.s, a);
      if (stepped === box.s) return box;
      const s = a.type === "tick" ? stepped : { ...stepped, rev: stepped.rev + ACTION_REV_BUMP };
      return { s, session: sessionAfter(box.s, s, box.session) };
    }
  }
}

/** A block of focus or a rest that ended while this page was alive (see `isFreshEnd`). */
export type PhaseEnd =
  | { kind: "focus"; minutes: number; lastRound: boolean }
  | { kind: "break" };
