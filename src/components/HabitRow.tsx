"use client";

import { Camera, Check, Timer, Warning } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useEffect, useId, useOptimistic, useRef, useState, useTransition } from "react";
import { checkIn, checkItem, uncheckItem, undoCheckIn } from "@/app/(app)/habitos/actions";
import {
  IDLE_QUEUE,
  applyItemChange,
  checkedCount,
  nextSettled,
  pruneSettledItems,
  settleToggle,
  settledDone,
  settledIsStale,
  settleQueue,
  settledItems,
  tapQueue,
  type Settled,
  type SettledItems,
  type ToggleAction,
  type ToggleQueue,
} from "@/domain/optimistic-toggle";
import { baseSubtitle, habitSubtitle, undoLosesCopy, type TodayItem, type TodayRow } from "@/domain/today";
import { logEntryHref } from "@/lib/log-text";
import type { PickerBook } from "@/lib/reading-books";
import { addLogOffered, habitRowPropsEqual } from "./habit-row-equal";
import { GroupChip } from "./groups/GroupChip";
import { ItemChecklist } from "./ItemChecklist";
import type { CardioSheetMode } from "./logs/CardioSheet";
import { QuantityControl } from "./logs/QuantityControl";
import type { ReadingSheetMode } from "./logs/ReadingSheet";
import type { TimeSheetMode } from "./logs/TimeSheet";
import type { WatchSheetMode } from "./logs/WatchSheet";
import { Button } from "./ui/Button";
import { Toast, useToast } from "./ui/Toast";
import { VisibilityIcon } from "./habit-icon";

// Sheets are not on screen at first paint: each loads on demand, when its row opens it.
const ReadingSheet = dynamic(() => import("./logs/ReadingSheet").then((m) => m.ReadingSheet), { ssr: false });
const TimeSheet = dynamic(() => import("./logs/TimeSheet").then((m) => m.TimeSheet), { ssr: false });
const HabitWatchSheet = dynamic(() => import("./HabitWatchSheet").then((m) => m.HabitWatchSheet), { ssr: false });
const Sheet = dynamic(() => import("./ui/Sheet").then((m) => m.Sheet), { ssr: false });
const CardioSheet = dynamic(() => import("./logs/CardioSheet").then((m) => m.CardioSheet), { ssr: false });

/** What a reading habit's row needs for its sheet: your books and today's check-in and reading. */
export type RowReading = {
  books: PickerBook[];
  checkinId: string | null;
  entry: { bookId: string; fromPage: number; toPage: number } | null;
};

type OpenSheet =
  | { type: "reading"; mode: ReadingSheetMode }
  | { type: "time"; mode: TimeSheetMode }
  | { type: "watch"; mode: WatchSheetMode }
  | { type: "cardio"; mode: CardioSheetMode };

function Box({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex size-6 shrink-0 items-center justify-center rounded-sm text-on-accent ${
        done ? "bg-accent" : "border-[1.5px] border-outline-strong bg-surface"
      }`}
    >
      {done ? <Check size={16} weight="bold" /> : null}
    </span>
  );
}

const ACTION = "inline-flex h-11 shrink-0 items-center text-small font-medium text-accent";

/**
 * List-style row inside a Card. Plain habit: tap to check. Photo: "Foto" chip. Items: checklist
 * below. Reading, time, watch and cardio habits: "Hecho" opens their sheet ("¿Qué leíste hoy?",
 * "¿Cuánto rato?", "¿Qué viste hoy?", "¿Cuánto trotaste hoy?"); time also offers "Medir" and,
 * once done, "+ Tiempo"; cardio offers "+ Salida". Quantity habits show their control (quick add,
 * running total) instead of "Hecho" and have no undo: you remove sums. Done without a log on a
 * habit with a log type: "Añadir registro". Undoing a check-in that has a log asks first.
 *
 * Memoized by value: a tap on one row refreshes Hoy, and the other rows keep what they rendered.
 */
function HabitRowView({
  row,
  today,
  timeZone,
  checkinId,
  reading,
  logsKnown = true,
  group,
}: {
  row: TodayRow;
  /** local date of Hoy (`YYYY-MM-DD`), for the "Añadir registro" link */
  today: string;
  timeZone: string;
  /** today's check-in of this habit, when it exists */
  checkinId: string | null;
  reading?: RowReading;
  /** false when today's logs could not be read: no "Añadir registro" then (Hoy itself shows a retry instead of rows) */
  logsKnown?: boolean;
  /** the live group this habit is linked to: a small chip next to the name */
  group?: { name: string; color: string };
}) {
  const [, start] = useTransition();
  const [, startItem] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  // a confirmed flip is held until the refreshed props show it: the optimistic value alone is dropped
  // when the transition ends, and a late or stale payload would flip the row back to its old state
  const [settled, setSettled] = useState<Settled>(null);
  const [heldItems, setHeldItems] = useState<SettledItems>({});
  const [doneNow, setDone] = useOptimistic(settledDone(row.done, settled));
  // the steps flip at once too, and with them the "N de M" count and the habit's own box
  const [items, flipItem] = useOptimistic(settledItems(row.items, heldItems), applyItemChange);
  // taps made while an action is in flight only move the latest intent; one follow-up reaches it (see tapQueue)
  const queue = useRef<ToggleQueue>(IDLE_QUEUE);
  const itemQueues = useRef<Record<string, ToggleQueue>>({});
  // what the props say right now, for async continuations that outlive the render that started them
  const live = useRef({ done: row.done, items: row.items });
  live.current = { done: row.done, items: row.items };
  useEffect(() => {
    if (settledIsStale(row.done, settled)) setSettled(null);
  }, [row.done, settled]);
  useEffect(() => {
    const next = pruneSettledItems(row.items, heldItems);
    if (next !== heldItems) setHeldItems(next);
  }, [row.items, heldItems]);
  // props that never caught up (a stale router payload): ask for the page again, then let go
  const holding = settled !== null || Object.keys(heldItems).length > 0;
  useEffect(() => {
    if (!holding) return;
    const refresh = setTimeout(() => router.refresh(), 1500);
    const release = setTimeout(() => {
      setSettled(null);
      setHeldItems({});
    }, 6000);
    return () => {
      clearTimeout(refresh);
      clearTimeout(release);
    };
  }, [holding, router]);
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const undoCopy = undoLosesCopy(row);
  const undoBodyId = useId();
  const [toast, showToast] = useToast();
  const hasItems = row.items.length > 0;
  const checked = checkedCount(items);
  // all steps checked is what completes a habit with steps (the database makes its check-in)
  const done = hasItems && items !== row.items && items.length > 0 ? checked === items.length : doneNow;
  const plain = !hasItems && !row.requiresPhoto;
  const readingFlow = plain && row.logType === "reading" && reading !== undefined;
  const timeFlow = plain && row.logType === "time";
  const watchFlow = plain && row.logType === "watch";
  const cardioFlow = plain && row.logType === "cardio";
  const quantity = plain && row.logType === "quantity" ? row.quantity : null;

  // what the row confirms right now: held flips count, so a quick second tap is not a repeat
  const confirmed = settledDone(row.done, settled);
  // what the user last asked for: a tap while an action is in flight acts on this, not on the stale confirmed state
  const current = queue.current.intent ?? queue.current.target ?? confirmed;

  function toggle() {
    setError(null);
    if (!current) {
      if (readingFlow) return setSheet({ type: "reading", mode: { kind: "checkin", habitId: row.id } });
      if (timeFlow) return setSheet({ type: "time", mode: { kind: "checkin", habitId: row.id } });
      if (watchFlow) return setSheet({ type: "watch", mode: { kind: "checkin", habitId: row.id } });
      if (cardioFlow) return setSheet({ type: "cardio", mode: { kind: "checkin" } });
    }
    if (current && undoCopy) return setConfirmUndo(true);
    run();
  }

  function run() {
    setConfirmUndo(false);
    const step = tapQueue(queue.current, confirmed);
    queue.current = step.queue;
    if (step.run) send(step.run, step.shown!);
    else start(async () => setDone(step.shown!));
  }

  // one action in flight; when it settles, the follow-up (if the intent moved meanwhile) runs in a new one
  function send(action: ToggleAction, to: boolean) {
    start(async () => {
      setDone(to);
      const result = await settleToggle(() => (action === "undo" ? undoCheckIn(row.id) : checkIn(row.id)));
      // a refusal or a dropped connection: the queue is dropped and the optimistic value reverts when the transition ends
      if (!result.ok) setError(result.error);
      const next = settleQueue(queue.current, result.ok);
      queue.current = next.queue;
      setSettled(nextSettled(live.current.done, to, result));
      if (next.run) send(next.run, next.shown!);
    });
  }

  function toggleItem(item: TodayItem) {
    setError(null);
    const step = tapQueue(itemQueues.current[item.id] ?? IDLE_QUEUE, item.checked);
    itemQueues.current[item.id] = step.queue;
    if (step.run) sendItem(item.id, step.run, step.shown!);
    else startItem(async () => flipItem({ id: item.id, checked: step.shown! }));
  }

  function sendItem(id: string, action: ToggleAction, to: boolean) {
    startItem(async () => {
      flipItem({ id, checked: to });
      const result = await settleToggle(() => (action === "undo" ? uncheckItem(id) : checkItem(id)));
      if (!result.ok) setError(result.error);
      const next = settleQueue(itemQueues.current[id] ?? IDLE_QUEUE, result.ok);
      itemQueues.current[id] = next.queue;
      if (result.ok) {
        const from = live.current.items.find((i) => i.id === id)?.checked ?? !to;
        setHeldItems((h) => ({ ...h, [id]: { from, value: to } }));
      }
      if (next.run) sendItem(id, next.run, next.shown!);
    });
  }

  const close = () => setSheet(null);

  // what sits at the right edge of the row
  let action: React.ReactNode = null;
  if (hasItems) {
    action = (
      <span className="font-mono text-small font-medium text-muted">
        {checked} de {items.length}
      </span>
    );
  } else if (quantity) {
    action = null;
  } else if (timeFlow && !done) {
    action = (
      <Link
        href={`/habitos/${row.id}/pomodoro`}
        aria-label={`Medir tiempo de ${row.name}`}
        className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-accent-soft px-3 text-small font-medium text-accent"
      >
        <Timer size={16} weight="light" aria-hidden />
        Medir
      </Link>
    );
  } else if (timeFlow && done) {
    action = (
      <button
        type="button"
        aria-label={`+ Tiempo: ${row.name}`}
        onClick={() => setSheet({ type: "time", mode: { kind: "add", habitId: row.id } })}
        className={ACTION}
      >
        + Tiempo
      </button>
    );
  } else if (cardioFlow && done && checkinId) {
    action = (
      <button
        type="button"
        aria-label={`+ Salida: ${row.name}`}
        onClick={() => setSheet({ type: "cardio", mode: { kind: "add", checkinId } })}
        className={ACTION}
      >
        + Salida
      </button>
    );
  } else if (done && addLogOffered(row, logsKnown) && row.logType !== "none" && row.logType !== "quantity") {
    action =
      row.logType === "reading" && readingFlow && reading.checkinId ? (
        <button
          type="button"
          onClick={() =>
            setSheet({ type: "reading", mode: { kind: "edit", checkinId: reading.checkinId!, entry: reading.entry } })
          }
          className={ACTION}
        >
          Añadir registro
        </button>
      ) : (
        <Link href={logEntryHref(row.id, row.logType, today)} className={ACTION}>
          Añadir registro
        </Link>
      );
  } else if (row.requiresPhoto && !done) {
    action = (
      <Link
        href={`/habitos/${row.id}/foto`}
        className="inline-flex h-11 items-center gap-1 rounded-full bg-accent-soft px-3 text-small font-medium text-accent"
      >
        <Camera size={16} weight="light" aria-hidden />
        Foto
      </Link>
    );
  }

  const text = (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-2">
        {/* identity color: decorative, the name carries the meaning */}
        <span aria-hidden data-habit-color={row.color} className="size-2 shrink-0 rounded-full bg-(--habit)" />
        <Link
          href={`/habitos/${row.id}`}
          className={`truncate text-body ${done ? "text-muted line-through" : "text-ink"}`}
        >
          {row.name}
        </Link>
      </span>
      {/* fixed height: the mono streak figure (and the group chip) must not change this line; with a chip the text stays on one line and the chip alone truncates, so the habit name never loses width to it */}
      <span className={`flex h-5 items-center gap-1 text-small text-muted${group ? " min-w-0 overflow-hidden whitespace-nowrap" : ""}`}>
        <VisibilityIcon value={row.visibility} />
        {quantity ? baseSubtitle(row) : habitSubtitle(row)}
        {row.streak > 0 ? (
          <span className="ml-1 font-mono text-ink">
            {row.streak}
            <span className="font-sans text-muted">
              {row.frequency.type === "daily" ? " d" : " sem"}
            </span>
          </span>
        ) : null}
        {group ? (
          <span className="ml-1 flex min-w-0 shrink overflow-hidden">
            <GroupChip name={group.name} color={group.color} />
          </span>
        ) : null}
      </span>
    </span>
  );

  return (
    <div>
      <div className="flex min-h-[60px] items-center gap-4 py-2.5">
        {quantity ? (
          <span className="size-6 shrink-0" aria-hidden />
        ) : !plain ? (
          <Box done={done} />
        ) : (
          <button
            type="button"
            onClick={toggle}
            role="checkbox"
            aria-checked={done}
            aria-label={row.name}
            className="-m-2.5 flex size-11 shrink-0 items-center justify-center"
          >
            <Box done={done} />
          </button>
        )}
        {text}
        {action}
      </div>
      {hasItems ? <ItemChecklist habitId={row.id} items={items} onToggle={toggleItem} /> : null}
      {quantity ? (
        <div className="pb-3 pl-10">
          <QuantityControl
            habitId={row.id}
            config={quantity.config}
            total={quantity.total}
            entries={quantity.entries}
            timeZone={timeZone}
            color={row.color}
          />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="flex items-center gap-1 pb-2 text-small text-ink">
          <Warning size={16} weight="light" className="shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}
      {sheet?.type === "reading" && reading ? (
        <ReadingSheet open mode={sheet.mode} books={reading.books} onClose={close} onSaved={showToast} />
      ) : null}
      {sheet?.type === "time" ? (
        <TimeSheet open mode={sheet.mode} preset={row.preset} onClose={close} onSaved={showToast} />
      ) : null}
      {sheet?.type === "watch" && sheet.mode.kind === "checkin" ? (
        <HabitWatchSheet habitId={sheet.mode.habitId} onClose={close} onSaved={showToast} />
      ) : null}
      {sheet?.type === "cardio" ? (
        <CardioSheet
          open
          mode={sheet.mode}
          habitId={row.id}
          defaultKind={row.preset === "walk" ? "walk" : "run"}
          onClose={close}
          onSaved={showToast}
        />
      ) : null}
      {undoCopy && confirmUndo ? (
        <Sheet
          open
          title="¿Deshacer el hábito de hoy?"
          onClose={() => setConfirmUndo(false)}
          describedBy={undoBodyId}
        >
          <p id={undoBodyId} className="text-body text-muted">{undoCopy}</p>
          <Button onClick={run}>Deshacer</Button>
          <Button variant="secondary" onClick={() => setConfirmUndo(false)}>
            Cancelar
          </Button>
        </Sheet>
      ) : null}
      <Toast message={toast} />
    </div>
  );
}

export type HabitRowProps = Parameters<typeof HabitRowView>[0];

export const HabitRow = memo(HabitRowView, habitRowPropsEqual);
