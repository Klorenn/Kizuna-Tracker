"use client";

import { Camera, Check, Warning } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useId, useOptimistic, useState, useTransition } from "react";
import { checkIn, undoCheckIn } from "@/app/(app)/habitos/actions";
import { habitSubtitle, undoLosesCopy, type TodayRow } from "@/domain/today";
import type { PickerBook } from "@/lib/reading-books";
import { ItemChecklist } from "./ItemChecklist";
import { ReadingSheet, type ReadingSheetMode } from "./logs/ReadingSheet";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";
import { Toast, useToast } from "./ui/Toast";
import { VisibilityIcon } from "./habit-icon";

/** What a reading habit's row needs for its sheet: your books and today's check-in and reading. */
export type RowReading = {
  books: PickerBook[];
  checkinId: string | null;
  entry: { bookId: string; fromPage: number; toPage: number } | null;
};

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

/**
 * List-style row inside a Card. Plain habit: tap to check. Photo: "Foto" chip. Items: checklist
 * below. Reading habit: "Hecho" opens "¿Qué leíste hoy?". Done without a log on a habit with a log
 * type: "Añadir registro". Undoing a check-in that has a log asks first (the log goes with it).
 */
export function HabitRow({ row, reading }: { row: TodayRow; reading?: RowReading }) {
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useOptimistic(row.done);
  const [sheet, setSheet] = useState<ReadingSheetMode | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const undoCopy = undoLosesCopy(row);
  const undoBodyId = useId();
  const [toast, showToast] = useToast();
  const hasItems = row.items.length > 0;
  const checkedCount = row.items.filter((i) => i.checked).length;
  const readingFlow = row.logType === "reading" && reading !== undefined;

  function toggle() {
    setError(null);
    if (!row.done && readingFlow) return setSheet({ kind: "checkin", habitId: row.id });
    if (row.done && undoCopy) return setConfirmUndo(true);
    run();
  }

  function run() {
    setConfirmUndo(false);
    start(async () => {
      setDone(!row.done);
      const result = row.done ? await undoCheckIn(row.id) : await checkIn(row.id);
      if (!result.ok) setError(result.error);
    });
  }

  const addLog =
    done && row.log === null && row.logType !== "none" ? (
      row.logType === "reading" && readingFlow && reading.checkinId ? (
        <button
          type="button"
          onClick={() => setSheet({ kind: "edit", checkinId: reading.checkinId!, entry: reading.entry })}
          className="inline-flex h-11 shrink-0 items-center text-small font-medium text-accent"
        >
          Añadir registro
        </button>
      ) : (
        <Link
          href={`/habitos/${row.id}/${row.logType === "reading" ? "lectura" : "entrenamiento"}`}
          className="inline-flex h-11 shrink-0 items-center text-small font-medium text-accent"
        >
          Añadir registro
        </Link>
      )
    ) : null;

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
      <span className="flex items-center gap-1 text-small text-muted">
        <VisibilityIcon value={row.visibility} />
        {habitSubtitle(row)}
        {row.streak > 0 ? (
          <span className="ml-1 font-mono text-ink">
            {row.streak}
            <span className="font-sans text-muted">
              {row.frequency.type === "daily" ? " d" : " sem"}
            </span>
          </span>
        ) : null}
      </span>
    </span>
  );

  return (
    <div>
      <div className="flex min-h-[60px] items-center gap-4 py-2.5">
        {hasItems || row.requiresPhoto ? (
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
        {hasItems ? (
          <span className="font-mono text-small font-medium text-muted">
            {checkedCount} de {row.items.length}
          </span>
        ) : addLog ? (
          addLog
        ) : row.requiresPhoto && !done ? (
          <Link
            href={`/habitos/${row.id}/foto`}
            className="inline-flex h-11 items-center gap-1 rounded-full bg-accent-soft px-3 text-small font-medium text-accent"
          >
            <Camera size={16} weight="light" aria-hidden />
            Foto
          </Link>
        ) : null}
      </div>
      {hasItems ? <ItemChecklist habitId={row.id} items={row.items} /> : null}
      {error ? (
        <p role="alert" className="flex items-center gap-1 pb-2 text-small text-ink">
          <Warning size={16} weight="light" className="shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}
      {sheet && reading ? (
        <ReadingSheet open mode={sheet} books={reading.books} onClose={() => setSheet(null)} onSaved={showToast} />
      ) : null}
      {undoCopy ? (
        <Sheet
          open={confirmUndo}
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
