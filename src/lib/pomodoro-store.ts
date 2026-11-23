"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
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

// Local persistence of the timer (one key per habit) and the hook that drives it. The state is a
// pure reducer over stored instants (src/domain/pomodoro.ts); this file only stores it, shares it
// between tabs and ticks it.

const PREFIX = "kizuna:pomodoro:";
const KEY_RE = /^kizuna:pomodoro:([^:]+)$/;
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
const prefsKey = (habitId: string) => `${PREFIX}config:${habitId}`;
const sessionKey = (habitId: string) => `${PREFIX}session:${habitId}`;

/** idle / ready / done untouched for 24 h come back as idle (same config, unsent blocks kept). */
function settleStale(s: PomodoroState, now: number): PomodoroState {
  if (s.phase !== "idle" && s.phase !== "ready" && s.phase !== "done") return s;
  const ref = s.lastTickAt ?? s.phaseStartedAt;
  if (ref === null || now - ref <= STALE_MS) return s;
  return { ...initialPomodoro(s.habitId, s.config, s.mode), pending: s.pending, rev: s.rev };
}

export function loadPomodoro(habitId: string, storage: Storage, now: number = Date.now()): PomodoroState | null {
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
export function savePomodoro(s: PomodoroState, storage: Storage): boolean {
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
  storage: Storage,
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
export function discardPending(habitId: string, storage: Storage, now: number = Date.now()): number {
  const s = loadPomodoro(habitId, storage, now);
  if (!s || s.pending.length === 0) return 0;
  let next = s;
  for (const p of s.pending) next = pomodoroReducer(next, { type: "drop", blockId: p.blockId });
  savePomodoro({ ...next, rev: next.rev + ACTION_REV_BUMP }, storage);
  return s.pending.length;
}

// ---------------------------------------------------------------- guarded, per-user storage

const USER_NS = (userId: string) => `kizuna:user:${userId}:`;
/** Writes a device refused (quota) or everything when storage is blocked: kept here, per user. */
const overlays = new Map<string, Map<string, string>>();

/** Storages already swept of the keys the first version wrote without a user namespace. */
const sweptLegacy = new WeakSet<Storage>();

/**
 * Before the per-user namespace the timers lived under plain `kizuna:pomodoro:*` keys. No account
 * can read them any more (and they would be sent under none), so they are removed, once per storage.
 */
function sweepLegacyKeys(b: Storage): void {
  if (sweptLegacy.has(b)) return;
  sweptLegacy.add(b);
  try {
    const doomed: string[] = [];
    for (let i = 0; i < b.length; i++) {
      const k = b.key(i);
      if (k !== null && k.startsWith(PREFIX)) doomed.push(k);
    }
    for (const k of doomed) b.removeItem(k);
  } catch {
    // blocked or failing storage: leave them, never break the timer
  }
}

/** A `Storage` scoped to one signed-in user that never throws and falls back to memory. */
export type PomodoroStorage = Storage & {
  /** True once storage was blocked or a write failed: the timer still runs, but not across reloads. */
  readonly degraded: boolean;
  /** The key the browser really uses (what a `storage` event reports). */
  physicalKey(key: string): string;
};

/**
 * Every key is namespaced by the user id, so one account's timer and pending blocks are never
 * read or sent under another account. Reading `window.localStorage` can itself throw (blocked
 * site data): then, and when a write fails, the data lives in memory and `degraded` is true.
 */
export function openPomodoroStorage(userId: string, getBase: () => Storage = () => window.localStorage): PomodoroStorage {
  const ns = USER_NS(userId);
  let overlay = overlays.get(userId);
  if (!overlay) overlays.set(userId, (overlay = new Map()));
  const mem = overlay;
  let degraded = false;
  const base = (): Storage | null => {
    try {
      return getBase();
    } catch {
      degraded = true;
      return null;
    }
  };
  const own = (): string[] => {
    const keys = new Set(mem.keys());
    const b = base();
    if (b) {
      try {
        for (let i = 0; i < b.length; i++) {
          const k = b.key(i);
          if (k !== null && k.startsWith(ns)) keys.add(k.slice(ns.length));
        }
      } catch {
        degraded = true;
      }
    }
    return [...keys];
  };
  const first = base();
  if (first === null) degraded = true;
  else sweepLegacyKeys(first);
  const store = {
    get length() {
      return own().length;
    },
    get degraded() {
      return degraded;
    },
    key: (i: number) => own()[i] ?? null,
    getItem(k: string) {
      if (mem.has(k)) return mem.get(k) ?? null;
      try {
        return base()?.getItem(ns + k) ?? null;
      } catch {
        degraded = true;
        return null;
      }
    },
    setItem(k: string, v: string) {
      const b = base();
      try {
        if (!b) throw new Error("blocked");
        b.setItem(ns + k, v);
        mem.delete(k);
      } catch {
        degraded = true;
        mem.set(k, v);
      }
    },
    removeItem(k: string) {
      mem.delete(k);
      try {
        base()?.removeItem(ns + k);
      } catch {
        degraded = true;
      }
    },
    clear() {
      for (const k of own()) store.removeItem(k);
    },
    physicalKey: (k: string) => ns + k,
  };
  return store as unknown as PomodoroStorage;
}

/**
 * Sign-out: removes this user's timers, preferences, session tallies and pending blocks (and the
 * un-namespaced keys of the first version). Another task wires the call into the sign-out flow.
 */
export function clearPomodoroStorage(userId: string, getBase: () => Storage = () => window.localStorage): void {
  overlays.delete(userId);
  let b: Storage;
  try {
    b = getBase();
  } catch {
    return;
  }
  const prefix = `${USER_NS(userId)}${PREFIX}`;
  const doomed: string[] = [];
  try {
    for (let i = 0; i < b.length; i++) {
      const k = b.key(i);
      if (k !== null && (k.startsWith(prefix) || k.startsWith(PREFIX))) doomed.push(k);
    }
    for (const k of doomed) b.removeItem(k);
  } catch {
    // nothing else to do
  }
}

function allStates(storage: Storage, now: number): PomodoroState[] {
  const out: PomodoroState[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    const m = key === null ? null : KEY_RE.exec(key);
    if (!m) continue;
    const s = loadPomodoro(m[1], storage, now);
    if (s) out.push(s);
  }
  return out;
}

/** States the Hoy strip shows: focus, break or ready. */
export function activePomodoros(storage: Storage, now: number = Date.now()): PomodoroState[] {
  return allStates(storage, now).filter((s) => s.phase === "focus" || s.phase === "break" || s.phase === "ready");
}

/** States with blocks that have not reached the server (any phase). */
export function pendingPomodoros(storage: Storage, now: number = Date.now()): PomodoroState[] {
  return allStates(storage, now).filter((s) => s.pending.length > 0);
}

/** The state of another tab, only when it is newer than `currentRev`. */
export function adoptRemote(currentRev: number, raw: string | null): PomodoroState | null {
  const s = parsePomodoroState(raw);
  return s && s.rev > currentRev ? s : null;
}

/** Calls `onChange` with the state another tab wrote (a higher `rev` than anything seen so far). */
export function subscribePomodoro(
  habitId: string,
  onChange: (s: PomodoroState | null) => void,
  storage?: PomodoroStorage,
): () => void {
  const key = storage ? storage.physicalKey(stateKey(habitId)) : stateKey(habitId);
  let seen = -1;
  try {
    seen = loadPomodoro(habitId, storage ?? window.localStorage)?.rev ?? -1;
  } catch {
    // ignore
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key !== key) return;
    const s = adoptRemote(seen, e.newValue);
    if (!s) return;
    seen = s.rev;
    onChange(s);
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
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

export function loadPrefs(habitId: string, storage: Storage): PomodoroPrefs {
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

export function savePrefs(habitId: string, prefs: PomodoroPrefs, storage: Storage): void {
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

function loadSession(habitId: string, storage: Storage): PomodoroSession {
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

function saveSession(habitId: string, session: PomodoroSession, storage: Storage): boolean {
  try {
    storage.setItem(sessionKey(habitId), JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- the hook

export function newBlockId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
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

/**
 * Drives the timer of one habit: reducer + storage + a 1 s tick (and on visibilitychange,
 * pageshow, focus). `tick` returns the same state while nothing expires, so the screen re-renders
 * only on real changes; the per-second readout lives in its own component (`useNow`).
 * `hydrated` is false until the stored state was read (the server render never has it);
 * `storageProblem` is true when the device would not keep the timer (blocked or full storage).
 */
export function usePomodoro(
  habitId: string,
  config: PomodoroConfig,
  opts: { storage: PomodoroStorage; mode?: TimerMode; onPhaseEnd?: (end: PhaseEnd) => void },
) {
  const { storage, onPhaseEnd, mode } = opts;
  const [box, dispatch] = useReducer(pomodoroBoxReducer, undefined, (): Box => ({
    s: initialPomodoro(habitId, config, mode),
    session: EMPTY_SESSION,
  }));
  const [hydrated, setHydrated] = useState(false);
  const [storageProblem, setStorageProblem] = useState(false);
  const boxRef = useRef(box);
  const endRef = useRef(onPhaseEnd);
  const savedRev = useRef(0);
  const savedSession = useRef(EMPTY_SESSION);
  const lastLiveTick = useRef<number | null>(null);
  useEffect(() => {
    boxRef.current = box;
    endRef.current = onPhaseEnd;
  });

  // read what is stored, settling whatever expired while the page was away
  useEffect(() => {
    const now = Date.now();
    const stored = loadPomodoro(habitId, storage, now);
    const session = stored ? reconcileSession(stored, loadSession(habitId, storage)) : loadSession(habitId, storage);
    if (stored) {
      const s = pomodoroReducer(stored, { type: "tick", at: now });
      savedRev.current = stored.rev;
      savedSession.current = session;
      dispatch({ type: "hydrate", box: { s, session: sessionAfter(stored, s, session) } });
    }
    lastLiveTick.current = now;
    setStorageProblem(storage.degraded);
    setHydrated(true);
  }, [habitId, storage]);

  // persist every real change; re-read first so another tab's newer state is adopted, not clobbered
  useEffect(() => {
    if (!hydrated) return;
    let failed = false;
    if (box.s.rev > savedRev.current) {
      const r = savePomodoroIfNewer(box.s, storage);
      if (r.status === "stale") {
        savedRev.current = r.remote.rev;
        dispatch({ type: "adopt", state: r.remote });
      } else {
        savedRev.current = box.s.rev;
        failed = r.status === "failed";
      }
    }
    if (box.session !== savedSession.current) {
      savedSession.current = box.session;
      if (!saveSession(habitId, box.session, storage)) failed = true;
    }
    if (failed || storage.degraded) setStorageProblem(true);
  }, [box, hydrated, habitId, storage]);

  useEffect(() => {
    if (!hydrated) return;
    return subscribePomodoro(
      habitId,
      (s) => {
        if (s) dispatch({ type: "adopt", state: s });
      },
      storage,
    );
  }, [habitId, hydrated, storage]);

  useEffect(() => {
    if (!hydrated) return;
    const tickNow = () => {
      const cur = boxRef.current.s;
      const at = Date.now();
      const prevTick = lastLiveTick.current;
      lastLiveTick.current = at;
      if (cur.phase !== "focus" && cur.phase !== "break") return;
      const next = pomodoroReducer(cur, { type: "tick", at });
      if (next === cur) return;
      dispatch({ type: "tick", at });
      const known = new Set(cur.pending.map((p) => p.blockId));
      const fresh = next.pending.filter((p) => !known.has(p.blockId));
      // a stopwatch closes 90-minute blocks silently; only its end (the cap) calls for an alert
      if (cur.phase === "focus" && fresh.length > 0 && (cur.mode !== "stopwatch" || next.phase === "done")) {
        const block = fresh[fresh.length - 1];
        if (isFreshEnd(prevTick, block.endedAt, at)) {
          endRef.current?.({ kind: "focus", minutes: block.minutes, lastRound: next.phase === "done" });
        }
      } else if (cur.phase === "break" && next.phase === "ready") {
        if (next.phaseStartedAt !== null && isFreshEnd(prevTick, next.phaseStartedAt, at)) endRef.current?.({ kind: "break" });
      }
    };
    const id = window.setInterval(tickNow, 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tickNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", tickNow);
    window.addEventListener("focus", tickNow);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", tickNow);
      window.removeEventListener("focus", tickNow);
    };
  }, [hydrated]);

  const getState = useCallback(() => boxRef.current.s, []);

  const act = useMemo(
    () => ({
      // the mode of the state decides which ids it uses: one for pomodoro and timer, three for the stopwatch
      start: () =>
        dispatch({
          type: "start",
          at: Date.now(),
          blockId: newBlockId(),
          blockIds: [newBlockId(), newBlockId(), newBlockId()],
        }),
      pause: () => dispatch({ type: "pause", at: Date.now() }),
      resume: () => dispatch({ type: "resume", at: Date.now() }),
      skip: () => dispatch({ type: "skip", at: Date.now(), blockId: newBlockId() }),
      finish: () => dispatch({ type: "finish", at: Date.now() }),
      reset: () => dispatch({ type: "reset" }),
      configure: (c: PomodoroConfig, m?: TimerMode) => dispatch({ type: "configure", config: c, mode: m }),
      setMode: (m: TimerMode, c: PomodoroConfig) => dispatch({ type: "setMode", mode: m, config: c }),
      apply: (events: PomodoroEvent[]) => events.forEach((e) => dispatch(e)),
    }),
    [],
  );

  return { state: box.s, session: box.session, hydrated, storageProblem, act, getState };
}

/** `Date.now()` re-read every `ms` while `active`: only the component calling it re-renders. */
export function useNow(active: boolean, ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
  return now;
}
