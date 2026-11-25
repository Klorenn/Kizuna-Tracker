"use client";

import { CheckCircle, DotsThree, Warning, X } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { announceGoal } from "@/lib/celebration-bus";
import { createQuickAddPress } from "@/lib/quick-add-press";
import { addQuantity, refreshQuantity, removeQuantity } from "@/app/(app)/registros/quantity-actions";
import { ProgressRing } from "@/components/ui/ProgressRing";
import type { HabitColor } from "@/domain/habit-colors";
import { formatAmount, progressLabel, stepAmount, type QuantityConfig } from "@/domain/quantity";
import {
  doneAfterSync,
  goalMet,
  offlineAfter,
  QUANTITY_MESSAGES,
  refusalText,
  sharedQuantityQueue,
  type QuantityQueue,
  type QueueEvent,
} from "@/lib/quantity-queue";
import type { QuantityEntryView } from "./QuantitySheet";

// The sheet is not visible on first paint, so it loads on demand.
const QuantitySheet = dynamic(() => import("./QuantitySheet").then((m) => m.QuantitySheet), { ssr: false });

const pendingLabel = (n: number) => `${n} ${n === 1 ? "suma pendiente" : "sumas pendientes"} de guardar`;

/**
 * Ring, running number, goal state and notices. Presentational: the running number (`shown`) is
 * optimistic, the goal state follows only `confirmed` (the server's total) or `serverDone`. A
 * rejection (dismissable), the connectivity line (`offline`) and the pending count are three
 * separate things and can all show at once.
 */
export function QuantityStatus({
  config,
  shown,
  confirmed,
  serverDone,
  pending,
  rejection,
  offline,
  onDismiss,
  color,
  part = "all",
}: {
  config: QuantityConfig;
  shown: number;
  confirmed: number;
  serverDone: boolean;
  pending: number;
  rejection: string | null;
  offline: string | null;
  onDismiss: () => void;
  color?: HabitColor;
  /**
   * `head`: ring and number; `notices`: the rejection, offline and pending lines; `all` (default): both.
   * The control puts the notices under the buttons, so a line that appears after a tap never moves the
   * button away from a second, fast tap.
   */
  part?: "head" | "notices" | "all";
}) {
  const done = goalMet(confirmed, config.target, serverDone);
  const pct = config.target > 0 ? (shown / config.target) * 100 : 0;
  const showHead = part !== "notices";
  const showNotices = part !== "head";
  return (
    <>
      {showHead ? (
      // fixed minimum height: the "Meta de hoy cumplida" line must not make the header taller, or the
      // quick-add button below would move away from a fast tap
      <div className="flex min-h-12 items-center gap-3">
        <ProgressRing value={pct} label={progressLabel(shown, config)} color={color} />
        <div className="flex min-w-0 flex-1 flex-col" aria-live="polite">
          <p className="font-mono text-small text-ink">{progressLabel(shown, config)}</p>
          {done ? (
            <p className="flex items-center gap-1 text-small text-ink">
              <CheckCircle size={16} weight="light" className="text-accent" aria-hidden />
              Meta de hoy cumplida
            </p>
          ) : null}
        </div>
      </div>
      ) : null}
      {showNotices && rejection ? (
        <div role="status" className="flex items-start gap-[6px] text-small text-pretty text-ink">
          <Warning size={16} weight="light" className="mt-[14px] shrink-0 text-alert" aria-hidden />
          <p className="flex-1 py-[14px]">{rejection}</p>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={onDismiss}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink hover:bg-field"
          >
            <X size={16} weight="light" aria-hidden />
          </button>
        </div>
      ) : null}
      {showNotices && offline ? (
        <p role="status" className="text-small text-pretty text-muted">
          {offline}
        </p>
      ) : null}
      {showNotices && pending > 0 ? (
        <p role="status" className="text-small text-muted">
          {pendingLabel(pending)}
        </p>
      ) : null}
    </>
  );
}

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
  const [rejection, setRejection] = useState<string | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const queueRef = useRef<QuantityQueue | null>(null);
  const dirty = useRef(false);
  const stamps = useRef(new Map<string, string>());
  // whether the server already counted today's goal as met: the tap that flips it is the one that celebrates
  const wasDone = useRef(goalMet(total, config.target));

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
    if (waiting.length > 0) dirty.current = true; // a restored backlog: refresh once when it drains
    setServerDone((d) => doneAfterSync(d, total, config.target));
    wasDone.current = goalMet(total, config.target);
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
  }, [habitId, total, entriesKey, config.target, queue, readView]);

  // Answers from the queue: confirmed, refused (rolled back) or offline (kept, retried).
  useEffect(() => {
    const q = queue();
    const showNotices = () => {
      const refused = q.takeNotices(habitId);
      if (refused.length === 0) return;
      const gone = new Set(refused.map((n) => n.entryId));
      setList((l) => l.filter((e) => !gone.has(e.id)));
      setRejection(refusalText(refused));
    };
    showNotices(); // refusals that arrived while this control was not mounted
    return q.subscribe((e: QueueEvent) => {
      // the line clears on any answer (accepted or refused) and when the queue drains
      setOffline((current) => offlineAfter(current, e, habitId));
      if (e.kind === "drained") {
        refreshIfIdle();
        return;
      }
      if (e.sum.habitId !== habitId) return;
      if (e.kind === "settled") {
        if (e.result.ok) {
          if (e.result.done && !wasDone.current) announceGoal(habitId);
          wasDone.current = e.result.done;
          setServerDone(e.result.done);
          setList((l) => l.map((x) => (x.id === e.sum.entryId ? { ...x, saved: true } : x)));
        } else {
          showNotices();
        }
      }
      readView(q);
    });
  }, [habitId, queue, readView, refreshIfIdle]);

  const add = useCallback(
    (amount: number) => {
      const q = queue();
      const { entryId } = q.add(habitId, amount, timeZone);
      const at = new Date().toISOString();
      stamps.current.set(entryId, at);
      dirty.current = true;
      setRejection(null);
      setList((l) => [...l, { id: entryId, amount, at, saved: false }]);
      readView(q);
    },
    [habitId, queue, readView, timeZone],
  );

  const remove = useCallback(
    async (entryId: string): Promise<void> => {
      const q = queue();
      const res = await removeQuantity(entryId);
      if (!res.ok) {
        setRejection(res.error);
        if (res.error === QUANTITY_MESSAGES.notFound) {
          // gone elsewhere: drop the stale row and refresh the numbers
          setList((l) => l.filter((e) => e.id !== entryId));
          dirty.current = true;
          refreshIfIdle();
        }
        return;
      }
      q.setTotal(habitId, res.total);
      wasDone.current = res.done;
      setServerDone(res.done);
      setRejection(null);
      setList((l) => l.filter((e) => e.id !== entryId));
      dirty.current = true;
      readView(q);
      refreshIfIdle(); // right away: the removal is already confirmed
    },
    [habitId, queue, readView, refreshIfIdle],
  );

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    refreshIfIdle();
  }, [refreshIfIdle]);

  const step = stepAmount(config);
  const stepText = formatAmount(step, config);

  // Press and hold 500 ms opens the sheet; the click that follows a long press adds nothing. Every
  // other click is one sum, so a fast double tap is two.
  const latest = useRef({ add: () => {}, openSheet: () => {} });
  useEffect(() => {
    latest.current = { add: () => add(step), openSheet: () => setSheetOpen(true) };
  });
  const [press] = useState(() =>
    createQuickAddPress({ add: () => latest.current.add(), openSheet: () => latest.current.openSheet() }),
  );
  useEffect(() => press.cancel, [press]);

  return (
    <div className="flex flex-col gap-3">
      <QuantityStatus
        part="head"
        config={config}
        shown={view.shown}
        confirmed={view.confirmed}
        serverDone={serverDone}
        pending={view.pending}
        rejection={rejection}
        offline={offline}
        onDismiss={() => setRejection(null)}
        color={color}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Sumar ${stepText}`}
          onPointerDown={press.onPointerDown}
          onPointerUp={press.cancel}
          onPointerLeave={press.cancel}
          onPointerCancel={press.cancel}
          onContextMenu={(e) => e.preventDefault()}
          onClick={press.onClick}
          // touch-manipulation: a fast second tap must not be read as a double-tap zoom
          className="inline-flex h-11 min-w-0 flex-1 touch-manipulation select-none items-center justify-center gap-1 rounded-md bg-accent px-3 font-mono text-small font-medium text-on-accent transition-colors duration-[120ms] hover:bg-accent-hover active:scale-[0.98] motion-reduce:active:scale-100"
        >
          +{stepText}
        </button>
        <button
          type="button"
          aria-label="Más opciones de cantidad"
          onClick={() => setSheetOpen(true)}
          className="inline-flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-md border border-outline-strong text-ink transition-colors duration-[120ms] hover:bg-field"
        >
          <DotsThree size={24} weight="light" aria-hidden />
        </button>
      </div>
      <QuantityStatus
        part="notices"
        config={config}
        shown={view.shown}
        confirmed={view.confirmed}
        serverDone={serverDone}
        pending={view.pending}
        rejection={rejection}
        offline={offline}
        onDismiss={() => setRejection(null)}
        color={color}
      />
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
          messages={[rejection, offline, view.pending > 0 ? pendingLabel(view.pending) : null].filter((m): m is string => m !== null)}
        />
      ) : null}
    </div>
  );
}
