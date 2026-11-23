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
} from "@/domain/pomodoro";

// Local persistence of the timer (one key per habit) and the hook that drives it. The state is a
// pure reducer over stored instants (src/domain/pomodoro.ts); this file only stores it, shares it
// between tabs and ticks it.

const PREFIX = "kizuna:pomodoro:";
const KEY_RE = /^kizuna:pomodoro:([^:]+)$/;
/** Resting states untouched for this long start over as idle. */
const STALE_MS = 24 * 60 * 60 * 1000;
/** A block that ended longer ago than this (tab asleep) updates the screen but does not beep. */
const FRESH_MS = 10_000;

export const stateKey = (habitId: string) => `${PREFIX}${habitId}`;
const prefsKey = (habitId: string) => `${PREFIX}config:${habitId}`;
const sessionKey = (habitId: string) => `${PREFIX}session:${habitId}`;

/** idle / ready / done untouched for 24 h come back as idle (same config, unsent blocks kept). */
function settleStale(s: PomodoroState, now: number): PomodoroState {
  if (s.phase !== "idle" && s.phase !== "ready" && s.phase !== "done") return s;
  const ref = s.lastTickAt ?? s.phaseStartedAt;
  if (ref === null || now - ref <= STALE_MS) return s;
  return { ...initialPomodoro(s.habitId, s.config), pending: s.pending, rev: s.rev };
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

export function savePomodoro(s: PomodoroState, storage: Storage): void {
  try {
    storage.setItem(stateKey(s.habitId), JSON.stringify(s));
  } catch {
    // storage full or blocked: the timer keeps working in memory
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
export function subscribePomodoro(habitId: string, onChange: (s: PomodoroState | null) => void): () => void {
  const key = stateKey(habitId);
  let seen = -1;
  try {
    seen = loadPomodoro(habitId, window.localStorage)?.rev ?? -1;
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
export type PomodoroPrefs = { preset: PomodoroPresetKey; config: PomodoroConfig; topic: string; muted: boolean };

export const DEFAULT_POMODORO_PREFS: PomodoroPrefs = {
  preset: "25-5",
  config: { focusMin: 25, breakMin: 5, cycles: 4 },
  topic: "",
  muted: false,
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

/** What this session has produced so far: blocks that closed, their minutes and the last one. */
export type PomodoroSession = { blocks: number; minutes: number; last: number };
export const EMPTY_SESSION: PomodoroSession = { blocks: 0, minutes: 0, last: 0 };

/** Updates the tally across one reducer step. A new session (idle/done -> focus) starts from zero. */
export function sessionAfter(prev: PomodoroState, next: PomodoroState, session: PomodoroSession): PomodoroSession {
  if ((prev.phase === "idle" || prev.phase === "done") && next.phase === "focus") return EMPTY_SESSION;
  if (next === prev) return session;
  const known = new Set(prev.pending.map((p) => p.blockId));
  const fresh = next.pending.filter((p) => !known.has(p.blockId));
  if (fresh.length === 0) return session;
  return {
    blocks: session.blocks + fresh.length,
    minutes: session.minutes + fresh.reduce((sum, p) => sum + p.minutes, 0),
    last: fresh[fresh.length - 1].minutes,
  };
}

function loadSession(habitId: string, storage: Storage): PomodoroSession {
  try {
    const d = JSON.parse(storage.getItem(sessionKey(habitId)) ?? "null") as Partial<PomodoroSession> | null;
    if (d && Number.isInteger(d.blocks) && Number.isInteger(d.minutes) && Number.isInteger(d.last)) {
      return { blocks: d.blocks as number, minutes: d.minutes as number, last: d.last as number };
    }
  } catch {
    // ignore
  }
  return EMPTY_SESSION;
}

function saveSession(habitId: string, session: PomodoroSession, storage: Storage): void {
  try {
    storage.setItem(sessionKey(habitId), JSON.stringify(session));
  } catch {
    // ignore
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

type Box = { s: PomodoroState; session: PomodoroSession };
type Action =
  | PomodoroEvent
  | { type: "hydrate"; box: Box }
  | { type: "adopt"; state: PomodoroState }
  | { type: "configure"; config: PomodoroConfig };

function boxReducer(box: Box, a: Action): Box {
  switch (a.type) {
    case "hydrate":
      return a.box;
    case "adopt":
      return a.state.rev > box.s.rev ? { s: a.state, session: box.session } : box;
    case "configure": {
      if (box.s.phase !== "idle") return box;
      const s: PomodoroState = {
        ...initialPomodoro(box.s.habitId, a.config),
        pending: box.s.pending,
        rev: box.s.rev + 1,
      };
      return { s, session: box.session };
    }
    default: {
      const s = pomodoroReducer(box.s, a);
      if (s === box.s) return box;
      return { s, session: sessionAfter(box.s, s, box.session) };
    }
  }
}

/** A block of focus or a rest that just ended on a live tick (not a catch-up after a long sleep). */
export type PhaseEnd =
  | { kind: "focus"; minutes: number; lastRound: boolean }
  | { kind: "break" };

/**
 * Drives the timer of one habit: reducer + localStorage + a 1 s tick (and on visibilitychange,
 * pageshow, focus). `tick` returns the same state while nothing expires, so the screen re-renders
 * only on real changes; the per-second readout lives in its own component (`useNow`).
 * `hydrated` is false until the stored state was read (the server render never has it).
 */
export function usePomodoro(
  habitId: string,
  config: PomodoroConfig,
  onPhaseEnd?: (end: PhaseEnd) => void,
) {
  const [box, dispatch] = useReducer(boxReducer, undefined, (): Box => ({
    s: initialPomodoro(habitId, config),
    session: EMPTY_SESSION,
  }));
  const [hydrated, setHydrated] = useState(false);
  const boxRef = useRef(box);
  const endRef = useRef(onPhaseEnd);
  const savedRev = useRef(0);
  const savedSession = useRef(EMPTY_SESSION);
  useEffect(() => {
    boxRef.current = box;
    endRef.current = onPhaseEnd;
  });

  // read what is stored, settling whatever expired while the page was away
  useEffect(() => {
    const stored = loadPomodoro(habitId, window.localStorage);
    const session = loadSession(habitId, window.localStorage);
    if (stored) {
      const s = pomodoroReducer(stored, { type: "tick", at: Date.now() });
      savedRev.current = stored.rev;
      savedSession.current = session;
      dispatch({ type: "hydrate", box: { s, session: sessionAfter(stored, s, session) } });
    }
    setHydrated(true);
  }, [habitId]);

  // persist every real change (phase changes, pause, the 15 s `lastTickAt` refresh)
  useEffect(() => {
    if (!hydrated) return;
    if (box.s.rev > savedRev.current) {
      savedRev.current = box.s.rev;
      savePomodoro(box.s, window.localStorage);
    }
    if (box.session !== savedSession.current) {
      savedSession.current = box.session;
      saveSession(habitId, box.session, window.localStorage);
    }
  }, [box, hydrated, habitId]);

  useEffect(() => {
    if (!hydrated) return;
    return subscribePomodoro(habitId, (s) => {
      if (s) dispatch({ type: "adopt", state: s });
    });
  }, [habitId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const tickNow = () => {
      const cur = boxRef.current.s;
      if (cur.phase !== "focus" && cur.phase !== "break") return;
      const at = Date.now();
      const next = pomodoroReducer(cur, { type: "tick", at });
      if (next === cur) return;
      dispatch({ type: "tick", at });
      const known = new Set(cur.pending.map((p) => p.blockId));
      const fresh = next.pending.filter((p) => !known.has(p.blockId));
      if (cur.phase === "focus" && fresh.length > 0) {
        const block = fresh[fresh.length - 1];
        if (at - block.endedAt <= FRESH_MS) {
          endRef.current?.({ kind: "focus", minutes: block.minutes, lastRound: next.phase === "done" });
        }
      } else if (cur.phase === "break" && next.phase === "ready") {
        if (next.phaseStartedAt !== null && at - next.phaseStartedAt <= FRESH_MS) endRef.current?.({ kind: "break" });
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
      start: () => dispatch({ type: "start", at: Date.now(), blockId: newBlockId() }),
      pause: () => dispatch({ type: "pause", at: Date.now() }),
      resume: () => dispatch({ type: "resume", at: Date.now() }),
      skip: () => dispatch({ type: "skip", at: Date.now(), blockId: newBlockId() }),
      finish: () => dispatch({ type: "finish", at: Date.now() }),
      reset: () => dispatch({ type: "reset" }),
      configure: (c: PomodoroConfig) => dispatch({ type: "configure", config: c }),
      apply: (events: PomodoroEvent[]) => events.forEach((e) => dispatch(e)),
    }),
    [],
  );

  return { state: box.s, session: box.session, hydrated, act, getState };
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
