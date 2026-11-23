"use client";

import { CheckCircle, DotsThree, Warning } from "@phosphor-icons/react/dist/ssr";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { addQuantity, refreshQuantity, removeQuantity } from "@/app/(app)/registros/quantity-actions";
import { ProgressRing } from "@/components/ui/ProgressRing";
import type { HabitColor } from "@/domain/habit-colors";
import { formatAmount, progressLabel, stepAmount, type QuantityConfig } from "@/domain/quantity";
import {
  goalMet,
  QUANTITY_MESSAGES,
  sharedQuantityQueue,
  type QuantityQueue,
  type QueueEvent,
} from "@/lib/quantity-queue";
import type { QuantityEntryView } from "./QuantitySheet";

// The sheet is not visible on first paint, so it loads on demand.
const QuantitySheet = dynamic(() => import("./QuantitySheet").then((m) => m.QuantitySheet), { ssr: false });

/**
 * Today's quantity control: progress ring, quick-add button and the entries sheet.
 *
 * Props (all plain, so Hoy can mount it from a server component):
 * - habitId: the quantity habit.
 * - config: unit, goal, step and view (`QuantityConfig` from `@/domain/quantity`); amounts are in base units.
 * - total: today's total as of the last server render (base units).
 * - entries: today's sums, oldest first: `{ id, amount, at }` with `at` an ISO instant.
 * - timeZone: IANA zone of the profile, used for the "08:10" time of each sum.
 * - color: optional habit color for the ring.
 *
 * One tap = one sum, shown at once (the running number) and sent by the tab's shared queue, which
 * retries with the same id when the network fails. "Meta de hoy cumplida" only follows the total the
 * server confirmed. Press and hold 500 ms, or the "⋯" button, opens the sheet. Nothing here
 * refreshes the page per tap: it refreshes once when the queue drains or the sheet closes.
 */
export function QuantityControl({
  habitId,
  config,
  total,
  entries,
  timeZone,
  color,
}: {
  habitId: string;
  config: QuantityConfig;
  total: number;
  entries: { id: string; amount: number; at: string }[];
  timeZone: string;
  color?: HabitColor;
}) {
  const [view, setView] = useState({ shown: total, confirmed: total, pending: 0 });
  const [serverDone, setServerDone] = useState(false);
  const [list, setList] = useState<QuantityEntryView[]>(() => entries.map((e) => ({ ...e, saved: true })));
  const [message, setMessage] = useState<{ text: string; kind: "error" | "offline" } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const queueRef = useRef<QuantityQueue | null>(null);
  const dirty = useRef(false);
  const stamps = useRef(new Map<string, string>());

  const queue = useCallback((): QuantityQueue => {
    if (!queueRef.current) queueRef.current = sharedQuantityQueue(addQuantity);
    return queueRef.current;
  }, []);

  const readView = useCallback(
    (q: QuantityQueue) =>
      setView({
        shown: q.optimisticTotal(habitId),
        confirmed: q.total(habitId),
        pending: q.pending().filter((s) => s.habitId === habitId).length,
      }),
    [habitId],
  );

  // Refresh Hoy once, when nothing is waiting any more.
  const refreshIfIdle = useCallback(() => {
    if (!dirty.current || queue().pending().length > 0) return;
    dirty.current = false;
    void refreshQuantity();
  }, [queue]);

  // Server data (first render and every refresh) is the new base; pending taps go back on top.
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  });
  const entriesKey = entries.map((e) => e.id).join(",");
  useEffect(() => {
    const q = queue();
    const server = entriesRef.current;
    q.setTotal(habitId, total, server.map((e) => e.id));
    const waiting = q.pending().filter((s) => s.habitId === habitId);
    setList([
      ...server.map((e) => ({ ...e, saved: true })),
      ...waiting.map((s) => ({
        id: s.entryId,
        amount: s.amount,
        at: stamps.current.get(s.entryId) ?? new Date().toISOString(),
        saved: false,
      })),
    ]);
    readView(q);
  }, [habitId, total, entriesKey, queue, readView]);

  // Answers from the queue: confirmed, refused (rolled back) or offline (kept, retried).
  useEffect(() => {
    const q = queue();
    const showNotices = () => {
      const refused = q.takeNotices(habitId);
      if (refused.length === 0) return;
      const gone = new Set(refused.map((n) => n.entryId));
      setList((l) => l.filter((e) => !gone.has(e.id)));
      setMessage({ text: refused[refused.length - 1].error, kind: "error" });
    };
    showNotices(); // refusals that arrived while this control was not mounted
    return q.subscribe((e: QueueEvent) => {
      if (e.kind === "drained") {
        refreshIfIdle();
        return;
      }
      if (e.sum.habitId !== habitId) return;
      if (e.kind === "offline") {
        setMessage({ text: e.error, kind: "offline" });
      } else if (e.result.ok) {
        setServerDone(e.result.done);
        setList((l) => l.map((x) => (x.id === e.sum.entryId ? { ...x, saved: true } : x)));
        setMessage((m) => (m?.kind === "offline" ? null : m));
      } else {
        showNotices();
      }
      readView(q);
    });
  }, [habitId, queue, readView, refreshIfIdle]);

  const add = useCallback(
    (amount: number) => {
      const q = queue();
      const { entryId } = q.add(habitId, amount);
      const at = new Date().toISOString();
      stamps.current.set(entryId, at);
      dirty.current = true;
      setMessage((m) => (m?.kind === "error" ? null : m));
      setList((l) => [...l, { id: entryId, amount, at, saved: false }]);
      readView(q);
    },
    [habitId, queue, readView],
  );

  const remove = useCallback(
    async (entryId: string): Promise<void> => {
      const q = queue();
      const res = await removeQuantity(entryId);
      if (!res.ok) {
        setMessage({ text: res.error, kind: "error" });
        if (res.error === QUANTITY_MESSAGES.notFound) {
          // gone elsewhere: drop the stale row and refresh the numbers
          setList((l) => l.filter((e) => e.id !== entryId));
          dirty.current = true;
          refreshIfIdle();
        }
        return;
      }
      q.setTotal(habitId, res.total);
      setServerDone(res.done);
      setMessage(null);
      setList((l) => l.filter((e) => e.id !== entryId));
      dirty.current = true;
      readView(q);
    },
    [habitId, queue, readView, refreshIfIdle],
  );

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    refreshIfIdle();
  }, [refreshIfIdle]);

  // Press and hold 500 ms opens the sheet; the click that follows a long press adds nothing.
  const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false });
  const cancelHold = () => {
    if (hold.current.timer) clearTimeout(hold.current.timer);
    hold.current.timer = null;
  };
  useEffect(() => cancelHold, []);

  const step = stepAmount(config);
  const done = goalMet(view.confirmed, config.target, serverDone);
  const pct = config.target > 0 ? (view.shown / config.target) * 100 : 0;
  const stepText = formatAmount(step, config);
  const pendingText = `${view.pending} ${view.pending === 1 ? "suma pendiente" : "sumas pendientes"} de guardar`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <ProgressRing value={pct} label={progressLabel(view.shown, config)} color={color} />
        <div className="flex min-w-0 flex-1 flex-col" aria-live="polite">
          <p className="font-mono text-small text-ink">{progressLabel(view.shown, config)}</p>
          {done ? (
            <p className="flex items-center gap-1 text-small text-ink">
              <CheckCircle size={16} weight="light" className="text-accent" aria-hidden />
              Meta de hoy cumplida
            </p>
          ) : null}
        </div>
      </div>
      {message ? (
        <p role="status" className="flex items-start gap-[6px] text-small text-pretty text-ink">
          <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
          {message.text}
        </p>
      ) : view.pending > 0 ? (
        <p role="status" className="text-small text-muted">
          {pendingText}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Sumar ${stepText}`}
          onPointerDown={() => {
            hold.current.fired = false;
            cancelHold();
            hold.current.timer = setTimeout(() => {
              hold.current.fired = true;
              hold.current.timer = null;
              setSheetOpen(true);
            }, 500);
          }}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => {
            if (hold.current.fired) {
              hold.current.fired = false;
              return;
            }
            add(step);
          }}
          className="inline-flex h-11 min-w-0 flex-1 select-none items-center justify-center gap-1 rounded-md bg-accent px-3 font-mono text-small font-medium text-on-accent transition-colors duration-[120ms] hover:bg-accent-hover active:scale-[0.98] motion-reduce:active:scale-100"
        >
          +{stepText}
        </button>
        <button
          type="button"
          aria-label="Más opciones de cantidad"
          onClick={() => setSheetOpen(true)}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-outline-strong text-ink transition-colors duration-[120ms] hover:bg-field"
        >
          <DotsThree size={24} weight="light" aria-hidden />
        </button>
      </div>
      {sheetOpen ? (
        <QuantitySheet
          open
          onClose={closeSheet}
          config={config}
          total={view.shown}
          entries={list}
          timeZone={timeZone}
          onAdd={add}
          onRemove={remove}
          message={message?.text ?? (view.pending > 0 ? pendingText : null)}
        />
      ) : null}
    </div>
  );
}
