"use client";

import { Timer } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { sendPomodoroBlock } from "@/app/(app)/registros/time-actions";
import { pomodoroReducer, pomodoroView, type PomodoroState } from "@/domain/pomodoro";
import { formatClock } from "@/domain/time";
import {
  activePomodoros,
  loadPrefs,
  pendingPomodoros,
  savePomodoro,
  stateKey,
  useNow,
} from "@/lib/pomodoro-store";
import { flushPendingDetailed } from "@/lib/pomodoro-sync";

/*
 * PomodoroBanner: the "Pomodoro en curso · Estudiar · 18:42" strip on Hoy. Self-contained (plain
 * props); Hoy (Task 28) mounts it.
 *
 *   <PomodoroBanner habits={[{ id, name }]} />
 *   - habits: the user's active `time` habits (id and name). A running timer of another habit is
 *     ignored.
 *
 * It reads the timers stored by the Pomodoro screen, settles whatever expired while nobody was
 * looking (so a finished block is saved even if you never go back to the screen) and sends the
 * blocks that are still pending. It renders nothing when no timer is running.
 */
export function PomodoroBanner({ habits }: { habits: { id: string; name: string }[] }) {
  const [active, setActive] = useState<PomodoroState[]>([]);
  const habitsRef = useRef(habits);
  useEffect(() => {
    habitsRef.current = habits;
  });

  const sync = useCallback(async () => {
    const ids = new Set(habitsRef.current.map((h) => h.id));
    const storage = window.localStorage;
    const now = Date.now();
    // settle expired phases and store them, so the screen and the banner agree
    for (const s of activePomodoros(storage, now)) {
      if (!ids.has(s.habitId)) continue;
      const next = pomodoroReducer(s, { type: "tick", at: now });
      if (next !== s) savePomodoro(next, storage);
    }
    const list = activePomodoros(storage, now).filter((s) => ids.has(s.habitId));
    setActive((prev) => (sameStates(prev, list) ? prev : list));
    for (const s of pendingPomodoros(storage, now)) {
      if (!ids.has(s.habitId)) continue;
      const topic = loadPrefs(s.habitId, storage).topic.trim() || null;
      const report = await flushPendingDetailed(s, sendPomodoroBlock, topic);
      if (report.events.length === 0) continue;
      // read the freshest copy: another tab or the screen may have moved on meanwhile
      const fresh = pendingPomodoros(storage, Date.now()).find((p) => p.habitId === s.habitId);
      if (!fresh) continue;
      let cur = fresh;
      for (const e of report.events) cur = pomodoroReducer(cur, e);
      if (cur !== fresh) savePomodoro(cur, storage);
    }
  }, []);

  useEffect(() => {
    void sync();
    const id = window.setInterval(() => void sync(), 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key.startsWith("kizuna:pomodoro:")) void sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    window.addEventListener("online", onVisible);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  }, [sync]);

  if (active.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {active.map((s) => (
        <Link
          key={s.habitId}
          href={`/habitos/${s.habitId}/pomodoro`}
          className="flex min-h-11 items-center gap-3 rounded-lg border border-line bg-accent-soft px-4 py-2 text-small text-ink"
        >
          <Timer size={20} weight="light" className="shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            Pomodoro en curso · {habits.find((h) => h.id === s.habitId)?.name}
          </span>
          {s.phase === "ready" ? <span className="shrink-0">Listo</span> : <BannerClock state={s} />}
        </Link>
      ))}
    </div>
  );
}

function sameStates(a: PomodoroState[], b: PomodoroState[]): boolean {
  return a.length === b.length && a.every((s, i) => s.habitId === b[i].habitId && s.rev === b[i].rev && s.phase === b[i].phase);
}

/** The ticking readout: only this span redraws every second. */
function BannerClock({ state }: { state: PomodoroState }) {
  const now = useNow(state.pausedAt === null, 1000);
  return <span className="shrink-0 font-mono text-ink">{formatClock(pomodoroView(state, now).remainingMs)}</span>;
}

export { stateKey as pomodoroStorageKey };
