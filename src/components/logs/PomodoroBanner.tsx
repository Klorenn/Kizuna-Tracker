"use client";

import { Timer, Warning, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { sendPomodoroBlock } from "@/app/(app)/registros/time-actions";
import { IconButton } from "@/components/ui/IconButton";
import { pomodoroReducer, pomodoroView, type PomodoroState } from "@/domain/pomodoro";
import { formatClock } from "@/domain/time";
import {
  ACTION_REV_BUMP,
  discardPending,
  loadPomodoro,
  loadPrefs,
  openPomodoroStorage,
  pendingPomodoros,
  activePomodoros,
  savePomodoro,
  useNow,
  type PomodoroStorage,
} from "@/lib/pomodoro-store";
import { createRetryScheduler, expiredMessage, flushPendingDetailed } from "@/lib/pomodoro-sync";

/*
 * PomodoroBanner: the "Pomodoro en curso · Estudiar · 18:42" strip on Hoy. Self-contained (plain
 * props); Hoy (Task 28) mounts it.
 *
 *   <PomodoroBanner userId timeZone habits={[{ id, name }]} />
 *   - userId: the signed-in user (stored timers are namespaced by it).
 *   - timeZone: the profile time zone (a block counts only for the local day it ended on).
 *   - habits: ALL of the user's active `time` habits (id and name). Pending blocks of a habit that
 *     is not in this list (archived, deleted, another log type) show up as stuck, with "Descartar".
 *
 * It reads the timers stored by the Pomodoro screen, settles whatever expired while nobody was
 * looking, and sends pending blocks (on mount, when the network or the tab returns, and with a
 * capped backoff while sends fail; never a block of an earlier local day). Refusals and expired
 * blocks are shown here, so nothing is lost silently. It renders nothing when there is nothing to say.
 */

type Row = { state: PomodoroState; name: string; orphan: boolean };

export function PomodoroBanner({
  userId,
  timeZone,
  habits,
}: {
  userId: string;
  timeZone: string;
  habits: { id: string; name: string }[];
}) {
  const [storage, setStorage] = useState<PomodoroStorage | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const habitsRef = useRef(habits);
  const zoneRef = useRef(timeZone);
  useEffect(() => {
    habitsRef.current = habits;
    zoneRef.current = timeZone;
  });
  useEffect(() => setStorage(openPomodoroStorage(userId)), [userId]);

  const refresh = useCallback(
    (store: PomodoroStorage) => {
      const names = new Map(habitsRef.current.map((h) => [h.id, h.name]));
      const now = Date.now();
      // settle expired phases and store them, so the screen and the banner agree
      for (const s of activePomodoros(store, now)) {
        if (!names.has(s.habitId)) continue;
        const next = pomodoroReducer(s, { type: "tick", at: now });
        if (next !== s) savePomodoro(next, store);
      }
      const list: Row[] = [];
      const seen = new Set<string>();
      for (const s of [...activePomodoros(store, now), ...pendingPomodoros(store, now)]) {
        if (seen.has(s.habitId)) continue;
        seen.add(s.habitId);
        const listed = names.has(s.habitId);
        const active = s.phase === "focus" || s.phase === "break" || s.phase === "ready";
        if (!listed && s.pending.length === 0) continue;
        if (listed && !active && s.pending.length === 0) continue;
        list.push({ state: s, name: names.get(s.habitId) ?? (loadPrefs(s.habitId, store).habitName || "un hábito"), orphan: !listed });
      }
      setRows((prev) => (sameRows(prev, list) ? prev : list));
      return list;
    },
    [],
  );

  const send = useCallback(async (store: PomodoroStorage): Promise<boolean> => {
    const names = new Set(habitsRef.current.map((h) => h.id));
    let retry = false;
    const lines: string[] = [];
    for (const s of pendingPomodoros(store, Date.now())) {
      if (!names.has(s.habitId)) continue; // stuck blocks wait for "Descartar"
      const topic = loadPrefs(s.habitId, store).topic.trim() || null;
      const report = await flushPendingDetailed(s, sendPomodoroBlock, topic, { timeZone: zoneRef.current, now: Date.now() });
      if (report.events.length > 0) {
        // read the freshest copy: the screen or another tab may have moved on meanwhile
        const fresh = loadPomodoro(s.habitId, store);
        if (fresh) {
          let cur = fresh;
          for (const e of report.events) cur = pomodoroReducer(cur, e);
          if (cur !== fresh) savePomodoro({ ...cur, rev: cur.rev + ACTION_REV_BUMP }, store);
        }
      }
      if (report.expired > 0) lines.push(expiredMessage(report.expired));
      lines.push(...report.dropped.map((d) => d.message));
      if (report.topicRejected) lines.push("No guardamos el tema, pero sí los minutos.");
      if (report.signedOut) lines.push("Inicia sesión para guardar tus bloques.");
      if (report.retryable > 0) retry = true;
    }
    if (lines.length > 0) setMessages((prev) => [...new Set([...prev, ...lines])]);
    refresh(store);
    return retry;
  }, [refresh]);

  useEffect(() => {
    if (!storage) return;
    const scheduler = createRetryScheduler({ run: () => send(storage) });
    let known = "";
    const settle = () => {
      const list = refresh(storage);
      // a new pending block (or the first look) triggers a send; failures back off by themselves
      const ids = list.flatMap((r) => r.state.pending.map((p) => p.blockId)).sort().join(",");
      if (ids !== known) {
        known = ids;
        if (ids !== "") scheduler.kick();
      }
    };
    settle();
    scheduler.kick();
    const id = window.setInterval(settle, 1000);
    const kick = () => scheduler.kick();
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduler.kick();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key.includes("kizuna:pomodoro:")) settle();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", kick);
    window.addEventListener("online", kick);
    window.addEventListener("storage", onStorage);
    return () => {
      scheduler.stop();
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", kick);
      window.removeEventListener("online", kick);
      window.removeEventListener("storage", onStorage);
    };
  }, [storage, refresh, send]);

  if (rows.length === 0 && messages.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {messages.map((m) => (
        <div
          key={m}
          role="status"
          className="flex min-h-11 items-start gap-2 rounded-lg border border-line bg-surface py-1 pl-4 pr-1 text-small text-ink"
        >
          <Warning size={16} weight="light" className="mt-3 shrink-0 text-alert" aria-hidden />
          <span className="min-w-0 flex-1 py-3 text-pretty">{m}</span>
          <IconButton label="Cerrar aviso" onClick={() => setMessages((prev) => prev.filter((x) => x !== m))}>
            <X size={20} weight="light" aria-hidden />
          </IconButton>
        </div>
      ))}
      {rows.map((r) =>
        r.orphan ? (
          <div
            key={r.state.habitId}
            className="flex min-h-11 items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2 text-small text-ink"
          >
            <Warning size={20} weight="light" className="shrink-0 text-alert" aria-hidden />
            <span className="min-w-0 flex-1 text-pretty">
              {r.name}: {r.state.pending.length === 1 ? "un bloque ya no se puede sumar" : `${r.state.pending.length} bloques ya no se pueden sumar`}
              , porque el hábito ya no lleva tiempo.
            </span>
            <button
              type="button"
              className="inline-flex h-11 shrink-0 items-center rounded-md px-3 text-small font-medium text-accent hover:bg-accent-soft"
              onClick={() => {
                if (storage) discardPending(r.state.habitId, storage);
                if (storage) refresh(storage);
              }}
            >
              Descartar
            </button>
          </div>
        ) : (
          <Link
            key={r.state.habitId}
            href={`/habitos/${r.state.habitId}/pomodoro`}
            className="flex min-h-11 items-center gap-3 rounded-lg border border-line bg-accent-soft px-4 py-2 text-small text-ink"
          >
            <Timer size={20} weight="light" className="shrink-0 text-accent" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {r.state.phase === "idle" || r.state.phase === "done"
                ? `Pendiente de sumar · ${r.name}`
                : `Pomodoro en curso · ${r.name}${r.state.pending.length > 0 ? " · Pendiente de sumar" : ""}`}
            </span>
            {r.state.phase === "ready" ? (
              <span className="shrink-0">Listo</span>
            ) : r.state.phase === "focus" || r.state.phase === "break" ? (
              <BannerClock state={r.state} />
            ) : null}
          </Link>
        ),
      )}
    </div>
  );
}

function sameRows(a: Row[], b: Row[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (r, i) =>
        r.state.habitId === b[i].state.habitId &&
        r.state.rev === b[i].state.rev &&
        r.state.phase === b[i].state.phase &&
        r.orphan === b[i].orphan &&
        r.name === b[i].name,
    )
  );
}

/** The ticking readout: only this span redraws every second. */
function BannerClock({ state }: { state: PomodoroState }) {
  const now = useNow(state.pausedAt === null, 1000);
  return <span className="shrink-0 font-mono text-ink">{formatClock(pomodoroView(state, now).remainingMs)}</span>;
}
