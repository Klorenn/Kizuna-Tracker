import { BookOpen, CaretRight, PencilSimple, Plus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { logEntryHref } from "@/components/logs/DayLogDetail";
import { Card } from "@/components/ui/Card";
import { monthTitle, shiftMonth, type MonthKey } from "@/domain/calendar";
import { bookProgress, monthlyReading, nextFromPage, type Book, type ReadingEntry } from "@/domain/logs";
import type { LocalDate } from "@/domain/types";
import { VALUE_BASE, valueSizeClass } from "@/lib/value-size";

/** The book being read: the "leyendo" one with the latest entry, else the newest "leyendo". */
export function currentBook(books: Book[], entries: ReadingEntry[]): Book | null {
  const reading = books.filter((b) => b.status === "reading");
  if (reading.length === 0) return null;
  const last = new Map<string, string>();
  for (const e of entries) if ((last.get(e.bookId) ?? "") < e.date) last.set(e.bookId, e.date);
  return [...reading].sort((a, b) => (last.get(b.id) ?? "").localeCompare(last.get(a.id) ?? ""))[0];
}

/**
 * Where the reader is in the book: the last page of the windowed entries, else `knownPage`
 * (the last entry ever, read separately), else nothing: never "Página 0" for a book that was
 * read before the window.
 */
export function bookPageHint(book: Book, entries: ReadingEntry[], knownPage: number | null): string | null {
  const inWindow = entries.some((e) => e.bookId === book.id);
  const page = inWindow ? nextFromPage(entries, book.id) : knownPage;
  // one format everywhere: "página 40 de 412 · 10 %", "página 40", "412 páginas"
  return bookProgress(page, book.totalPages);
}

export function ProgressStat({ label, value, caption }: { label: string; value: number | string; caption: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <p className="truncate text-small text-muted">{label}</p>
      <p data-value className={`${VALUE_BASE} ${typeof value === "string" ? valueSizeClass(value) : "text-[28px]"}`}>
        {value}
      </p>
      <p className="truncate text-small text-muted">{caption}</p>
    </div>
  );
}

export const progressLink =
  "flex min-h-11 items-center gap-2 border-t border-line px-4 text-body text-ink transition-colors duration-[120ms] hover:bg-field";

/** "Añadir registro de hoy" / "Editar registro de hoy", only when today has a check-in. */
export function TodayEntryLink({ href, logged }: { href: string; logged: boolean }) {
  return (
    <Link href={href} className={`${progressLink} font-medium text-accent`}>
      {logged ? <PencilSimple size={20} weight="light" aria-hidden /> : <Plus size={20} weight="light" aria-hidden />}
      <span className="flex-1 text-accent">{logged ? "Editar registro de hoy" : "Añadir registro de hoy"}</span>
    </Link>
  );
}

/** Habit detail > PROGRESO for a reading habit: this month vs the last, the current book, links. */
export function ReadingProgress({
  habitId,
  month,
  today,
  books,
  entries,
  todayEntry,
  knownPage,
}: {
  habitId: string;
  month: MonthKey;
  today: LocalDate;
  books: Book[];
  entries: ReadingEntry[];
  /** Today's check-in and whether it already has a reading; null without a check-in today. */
  todayEntry: { logged: boolean } | null;
  /** Last page reached in the current book when its entries fall before the window. */
  knownPage?: number | null;
}) {
  const now = monthlyReading(entries, books, month);
  const prev = monthlyReading(entries, books, shiftMonth(month, -1));
  const prevName = monthTitle(shiftMonth(month, -1)).name;
  const book = currentBook(books, entries);
  const hint = book ? bookPageHint(book, entries, knownPage ?? null) : null;

  return (
    <Card>
      <div className="flex gap-3 p-4">
        <ProgressStat label="Páginas este mes" value={now.pages} caption={`${prevName}: ${prev.pages}`} />
        <ProgressStat label="Libros terminados" value={now.booksFinished.length} caption={`${prevName}: ${prev.booksFinished.length}`} />
      </div>
      {book ? (
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <BookOpen size={20} weight="light" aria-hidden className="shrink-0 text-ink" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body text-ink">{book.title}</p>
            <p className="text-small text-muted">Leyendo</p>
            {hint ? <p className="font-mono text-small text-ink">{hint}</p> : null}
          </div>
        </div>
      ) : null}
      {todayEntry ? <TodayEntryLink href={logEntryHref(habitId, "reading", today)} logged={todayEntry.logged} /> : null}
      <Link href="/libros" className={progressLink}>
        <span className="flex-1">Libros</span>
        <CaretRight size={18} weight="light" aria-hidden className="text-muted" />
      </Link>
      <Link href="/resumen/lectura" className={progressLink}>
        <span className="flex-1">Ver lectura por mes</span>
        <CaretRight size={18} weight="light" aria-hidden className="text-muted" />
      </Link>
    </Card>
  );
}
