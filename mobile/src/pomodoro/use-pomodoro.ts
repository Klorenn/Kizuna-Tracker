import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import type { PomodoroConfig, TimerMode } from "@/domain/pomodoro";
import type { PomodoroEngine } from "./engine";

/**
 * Drives one engine from React: the box (state + session tally) re-renders only on a real change, a tick every second while
 * a phase runs and again when the app returns to the foreground (never counted by ticks: the state derives from stored instants).
 */
export function usePomodoro(engine: PomodoroEngine) {
  const [box, setBox] = useState(() => engine.load());
  const loaded = useRef(engine);
  useEffect(() => {
    // another habit or user: read its stored state (the first engine was loaded by the initializer above)
    if (loaded.current === engine) return;
    loaded.current = engine;
    setBox(engine.load());
  }, [engine]);
  const running = box.s.phase === "focus" || box.s.phase === "break";
  useEffect(() => {
    if (!running) return;
    const tick = () => setBox(engine.act.tick());
    const id = setInterval(tick, 1000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && tick());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [engine, running]);
  const act = useMemo(
    () => ({
      start: () => setBox(engine.act.start()),
      pause: () => setBox(engine.act.pause()),
      resume: () => setBox(engine.act.resume()),
      skip: () => setBox(engine.act.skip()),
      finish: () => setBox(engine.act.finish()),
      reset: () => setBox(engine.act.reset()),
      configure: (c: PomodoroConfig, m?: TimerMode) => setBox(engine.act.configure(c, m)),
      setMode: (m: TimerMode, c: PomodoroConfig) => setBox(engine.act.setMode(m, c)),
      sync: () => setBox(engine.get()),
    }),
    [engine],
  );
  return { box, act };
}

/** `Date.now()` re-read every `ms` while `active`: only what calls it re-renders. */
export function useNow(active: boolean, ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return now;
}
