"use client";

import { CheckCircle, DotsThree } from "@phosphor-icons/react/dist/ssr";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { addQuantity, removeQuantity } from "@/app/(app)/registros/quantity-actions";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Toast, useToast } from "@/components/ui/Toast";
import type { HabitColor } from "@/domain/habit-colors";
import { formatAmount, progressLabel, stepAmount, type QuantityConfig } from "@/domain/quantity";
import { createQuantityQueue, type QuantityQueue } from "@/lib/quantity-queue";
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
 * One tap = one sum (optimistic, retried with the same id when the network fails). Press and hold
 * 500 ms, or the "⋯" button, opens the sheet. Nothing here refreshes the whole screen by itself.
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
  const [shownTotal, setShownTotal] = useState(total);
  const [list, setList] = useState<QuantityEntryView[]>(() => entries.map((e) => ({ ...e, saved: true })));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, showToast] = useToast();
  const queueRef = useRef<QuantityQueue | null>(null);
  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  });

  // The queue is created lazily on the client; its settled callback keeps the screen in step.
  const ensureQueue = useCallback((): QuantityQueue => {
    if (queueRef.current) return queueRef.current;
    const q = createQuantityQueue(addQuantity, () => crypto.randomUUID(), {
      onSettled: (sum, result) => {
        if (sum.habitId !== habitId) return;
        if (result.ok) {
          setList((l) => l.map((e) => (e.id === sum.entryId ? { ...e, saved: true } : e)));
          setShownTotal(queueRef.current ? queueRef.current.optimisticTotal(habitId) : result.total);
        } else {
          setList((l) => l.filter((e) => e.id !== sum.entryId));
          setShownTotal(queueRef.current ? queueRef.current.optimisticTotal(habitId) : 0);
          showToastRef.current(result.error);
        }
      },
    });
    queueRef.current = q;
    return q;
  }, [habitId]);

  // New server data (after a refresh) replaces the local view; pending sums are added back on top.
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  });
  const entriesKey = entries.map((e) => e.id).join(",");
  useEffect(() => {
    const entries = entriesRef.current;
    const q = ensureQueue();
    q.setTotal(habitId, total);
    const waiting = q.pending().filter((s) => s.habitId === habitId);
    setList([
      ...entries.map((e) => ({ ...e, saved: true })),
      ...waiting.filter((s) => !entries.some((e) => e.id === s.entryId)).map((s) => ({ id: s.entryId, amount: s.amount, at: new Date().toISOString(), saved: false })),
    ]);
    setShownTotal(q.optimisticTotal(habitId));
  }, [habitId, total, entriesKey, ensureQueue]);

  // Resend whatever could not be sent: on mount and whenever the connection comes back.
  useEffect(() => {
    const q = ensureQueue();
    const retry = () => void q.flush();
    retry();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [ensureQueue]);

  const add = useCallback(
    (amount: number) => {
      const q = ensureQueue();
      const { entryId, optimisticTotal } = q.add(habitId, amount);
      setList((l) => [...l, { id: entryId, amount, at: new Date().toISOString(), saved: false }]);
      setShownTotal(optimisticTotal);
    },
    [ensureQueue, habitId],
  );

  const remove = useCallback(
    async (entryId: string): Promise<void> => {
      const res = await removeQuantity(entryId);
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      const q = ensureQueue();
      q.setTotal(habitId, res.total);
      setList((l) => l.filter((e) => e.id !== entryId));
      setShownTotal(q.optimisticTotal(habitId));
    },
    [ensureQueue, habitId, showToast],
  );

  // Press and hold 500 ms opens the sheet; the click that follows a long press adds nothing.
  const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false });
  const cancelHold = () => {
    if (hold.current.timer) clearTimeout(hold.current.timer);
    hold.current.timer = null;
  };
  useEffect(() => cancelHold, []);

  const step = stepAmount(config);
  const done = shownTotal >= config.target;
  const pct = config.target > 0 ? (shownTotal / config.target) * 100 : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <ProgressRing value={pct} label={progressLabel(shownTotal, config)} color={color} />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="font-mono text-small text-ink" aria-live="polite">
            {progressLabel(shownTotal, config)}
          </p>
          {done ? (
            <p className="flex items-center gap-1 text-small text-ink">
              <CheckCircle size={16} weight="light" className="text-accent" aria-hidden />
              Meta de hoy cumplida
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
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
          +{formatAmount(step, config)}
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
          onClose={() => setSheetOpen(false)}
          config={config}
          total={shownTotal}
          entries={list}
          timeZone={timeZone}
          onAdd={add}
          onRemove={remove}
        />
      ) : null}
      <Toast message={toast} />
    </div>
  );
}

