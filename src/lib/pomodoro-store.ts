"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  initialPomodoro,
  pomodoroReducer,
  type PomodoroConfig,
  type PomodoroEvent,
  type PomodoroState,
  type TimerMode,
} from "@/domain/pomodoro";
import {
  adoptRemote,
  EMPTY_SESSION,
  isFreshEnd,
  loadPomodoro,
  loadSession,
  POMODORO_PREFIX as PREFIX,
  pomodoroBoxReducer,
  reconcileSession,
  saveSession,
  savePomodoroIfNewer,
  sessionAfter,
  stateKey,
  type PhaseEnd,
  type PomodoroBox,
} from "@/lib/pomodoro-core";

// Local persistence of the timer (one key per habit) and the hook that drives it in the browser. The storage-agnostic
// logic (keys, load/save, prefs, session tally, box reducer) lives in pomodoro-core.ts and is re-exported here, so the
// web imports keep working and the native app shares the same code. This file keeps the `window` parts: the guarded
// per-user localStorage, the cross-tab subscription and the React hook.

export * from "@/lib/pomodoro-core";

const KEY_RE = /^kizuna:pomodoro:([^:]+)$/;
type Box = PomodoroBox;

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

// ---------------------------------------------------------------- the hook

export function newBlockId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

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
