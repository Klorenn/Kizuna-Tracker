"use client";

import { Warning } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { checkInWithReading, deleteReading, saveReading } from "@/app/(app)/registros/actions";
import { CatAnimation } from "@/components/brand/CatAnimation";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import { pagesLabel, pagesRead } from "@/domain/logs";
import { announceReading, clearReading, holdCelebrations } from "@/lib/celebration-bus";
import type { PickerBook } from "@/lib/reading-books";
import { BookPicker } from "./BookPicker";

export type ReadingSheetMode =
  /** Hoy: "Guardar" checks the habit in and saves the reading; "Omitir" only checks it in. */
  | { kind: "checkin"; habitId: string }
  /** Any day with a check-in: add, edit or delete its reading. Never touches the check-in. */
  | { kind: "edit"; checkinId: string; entry: { bookId: string; fromPage: number; toPage: number } | null };

const toInt = (s: string): number | null => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

export function readingTitle(mode: ReadingSheetMode): string {
  if (mode.kind === "checkin") return "¿Qué leíste hoy?";
  return mode.entry ? "Editar lectura" : "Añadir lectura";
}

/**
 * "¿Qué leíste hoy?" as a sheet. The close button never checks anything. Render it only while
 * open (the form starts from its props each time).
 */
export function ReadingSheet({
  open,
  onClose,
  mode,
  books,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  mode: ReadingSheetMode;
  books: PickerBook[];
  /** Edit mode: after a save or delete, with the toast message. */
  onSaved?: (message: string) => void;
}) {
  return (
    <Sheet open={open} title={readingTitle(mode)} onClose={onClose} tall>
      <ReadingForm mode={mode} books={books} onFinished={onClose} onSaved={onSaved} />
    </Sheet>
  );
}

/**
 * Book chips, Desde/Hasta with live pages, "Terminé este libro". Check-in mode: Guardar / Omitir.
 * Edit mode: Guardar / Borrar lectura. `onFinished` runs after a successful save, skip or delete.
 */
export function ReadingForm({
  mode,
  books: initialBooks,
  onFinished,
  onSaved,
}: {
  mode: ReadingSheetMode;
  books: PickerBook[];
  onFinished: () => void;
  onSaved?: (message: string) => void;
}) {
  const router = useRouter();
  const editing = mode.kind === "edit";
  const existing = mode.kind === "edit" ? mode.entry : null;
  const [books, setBooks] = useState(initialBooks);
  const [bookId, setBookId] = useState<string | null>(existing?.bookId ?? initialBooks[0]?.id ?? null);
  const book = books.find((b) => b.id === bookId) ?? null;
  const [from, setFrom] = useState(String(existing?.fromPage ?? book?.nextFrom ?? 0));
  const [to, setTo] = useState(existing ? String(existing.toPage) : "");
  const [finished, setFinished] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Hoy's check-in sheet: no celebration may open on top of it (one sheet at a time), even if a
  // refresh lands while it is open; Hoy re-evaluates when it closes.
  const holdsHoy = mode.kind === "checkin";
  useEffect(() => (holdsHoy ? holdCelebrations() : undefined), [holdsHoy]);

  const fromN = toInt(from);
  const toN = toInt(to);
  const pages = fromN !== null && toN !== null && toN >= fromN ? pagesRead({ fromPage: fromN, toPage: toN }) : null;

  function pick(id: string) {
    setBookId(id);
    const b = books.find((x) => x.id === id);
    if (b && !(existing && existing.bookId === id)) setFrom(String(b.nextFrom));
    setError(null);
  }

  function entryOrError() {
    if (!book) return { error: "Elige un libro o agrega uno nuevo." };
    if (fromN === null || toN === null) return { error: "Escribe las páginas con números enteros." };
    if (book.totalPages !== null && toN > book.totalPages) return { error: `El libro tiene ${book.totalPages} páginas.` };
    return { entry: { bookId: book.id, fromPage: fromN, toPage: toN, finished } };
  }

  function save() {
    const r = entryOrError();
    if (!r.entry) return setError(r.error);
    const entry = r.entry;
    const finishedTitle = entry.finished ? book!.title : null;
    setError(null);
    start(async () => {
      if (mode.kind === "checkin") {
        // announced BEFORE the action: its revalidation can re-render Hoy before it resolves
        announceReading({ pages: pagesRead(entry), finishedTitle });
        const res = await checkInWithReading(mode.habitId, entry);
        if (!res.ok) {
          clearReading();
          setError(res.error);
          if (res.checkedIn) router.refresh();
          return;
        }
        onFinished();
        router.refresh();
        return;
      }
      const res = await saveReading(mode.checkinId, entry);
      if (!res.ok) return setError(res.error);
      onFinished();
      onSaved?.("Lectura guardada");
      router.refresh();
    });
  }

  function skip() {
    if (mode.kind !== "checkin") return;
    setError(null);
    start(async () => {
      const res = await checkInWithReading(mode.habitId, null);
      if (!res.ok) return setError(res.error);
      onFinished();
      router.refresh();
    });
  }

  function remove() {
    if (mode.kind !== "edit") return;
    start(async () => {
      const res = await deleteReading(mode.checkinId);
      if (!res.ok) return setError(res.error);
      onFinished();
      onSaved?.("Lectura borrada");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-1">
        {!editing ? (
          <div className="flex items-center gap-3">
            {/* the small reading cat, at rest: it animates only in "Lectura registrada" */}
            <CatAnimation asset="read" width={48} variant="still" />
            <p className="text-small text-muted">Anota el libro y hasta qué página llegaste.</p>
          </div>
        ) : null}
        <BookPicker
          books={books}
          value={bookId}
          onChange={pick}
          onCreated={(b) => {
            setBooks((list) => [b, ...list]);
            setBookId(b.id);
            setFrom("0");
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Desde"
            name="from-page"
            inputMode="numeric"
            value={from}
            className="font-mono"
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input
            label="Hasta"
            name="to-page"
            inputMode="numeric"
            value={to}
            className="font-mono"
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <p className="font-mono text-body font-medium text-ink" aria-live="polite">
          {pages === null ? "—" : pagesLabel(pages)}
        </p>
        <Checkbox
          label="Terminé este libro"
          checked={finished}
          onChange={(e) => setFinished(e.target.checked)}
        />
        {error ? (
          <p role="alert" className="flex items-start gap-1 text-small text-pretty text-ink">
            <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
            {error}
          </p>
        ) : null}
        <Button onClick={save} disabled={pending}>
          Guardar
        </Button>
        {mode.kind === "checkin" ? (
          <Button variant="secondary" onClick={skip} disabled={pending}>
            Omitir
          </Button>
        ) : existing ? (
          confirmDelete ? (
            <div className="flex flex-col gap-2 rounded-md bg-field p-3">
              <p className="text-small text-ink">Se borrará la lectura de este día. Tu check-in no cambia.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={pending}>
                  Cancelar
                </Button>
                <Button onClick={remove} disabled={pending}>
                  Borrar
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} disabled={pending}>
              Borrar lectura
            </Button>
          )
        ) : null}
    </div>
  );
}
