"use client";

import { Books, Plus, Warning } from "@phosphor-icons/react/dist/ssr";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBook, deleteBook, setBookFinished, updateBook } from "@/app/(app)/registros/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import { Toast, useToast } from "@/components/ui/Toast";
import { MAX_BOOK_AUTHOR, MAX_BOOK_TITLE, MAX_PAGES } from "@/domain/logs";
import type { LocalDate } from "@/domain/types";
import { bookDeleteCopy } from "@/lib/reading-books";

export type BookView = {
  id: string;
  title: string;
  author: string | null;
  totalPages: number | null;
  status: "reading" | "finished";
  finishedOn: LocalDate | null;
  /** last page reached (0 when never read) */
  currentPage: number;
  readings: number;
  pages: number;
};

type Panel = { kind: "new" } | { kind: "edit" | "finish" | "delete"; book: BookView };

const shortDate = (d: LocalDate) => format(new Date(`${d}T12:00:00`), "d MMM yyyy", { locale: es });

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="flex items-start gap-1 text-small text-pretty text-ink">
      <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
      {error}
    </p>
  ) : null;
}

/** LEYENDO / TERMINADOS, with add, edit, finish (date never in the future), back to reading and delete. */
export function LibrosView({ books, today }: { books: BookView[]; today: LocalDate }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [toast, showToast] = useToast();
  const reading = books.filter((b) => b.status === "reading");
  const finished = books
    .filter((b) => b.status === "finished")
    .sort((a, b) => ((a.finishedOn ?? "") > (b.finishedOn ?? "") ? -1 : 1));
  const close = () => setPanel(null);
  const done = (message: string) => {
    setPanel(null);
    showToast(message);
  };

  return (
    <div className="flex flex-col gap-6">
      {books.length === 0 ? (
        <Card>
          <EmptyState
            title="Todavía no tienes libros"
            body="Agrega el que estás leyendo. Las páginas se anotan al marcar Leer."
            action={
              <Button className="w-auto!" onClick={() => setPanel({ kind: "new" })}>
                <Plus size={20} weight="light" aria-hidden />
                Nuevo libro
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Section id="leyendo" label="LEYENDO" empty="No estás leyendo ningún libro.">
            {reading.map((b) => (
              <BookRow
                key={b.id}
                book={b}
                hint={
                  b.totalPages ? (
                    <span className="font-mono">
                      {b.currentPage} de {b.totalPages}
                    </span>
                  ) : b.currentPage > 0 ? (
                    <>
                      Página <span className="font-mono">{b.currentPage}</span>
                    </>
                  ) : (
                    "Sin lecturas"
                  )
                }
                onOpen={() => setPanel({ kind: "edit", book: b })}
              />
            ))}
          </Section>
          <Section id="terminados" label="TERMINADOS" empty="Aún no terminas un libro.">
            {finished.map((b) => (
              <BookRow
                key={b.id}
                book={b}
                hint={b.finishedOn ? `Terminado el ${shortDate(b.finishedOn)}` : "Terminado"}
                onOpen={() => setPanel({ kind: "edit", book: b })}
              />
            ))}
          </Section>
          <Button variant="secondary" onClick={() => setPanel({ kind: "new" })}>
            <Plus size={20} weight="light" aria-hidden />
            Nuevo libro
          </Button>
        </>
      )}

      {panel?.kind === "new" ? <BookFormSheet onClose={close} onDone={done} /> : null}
      {panel?.kind === "edit" ? (
        <BookFormSheet
          book={panel.book}
          onClose={close}
          onDone={done}
          onFinish={() => setPanel({ kind: "finish", book: panel.book })}
          onDelete={() => setPanel({ kind: "delete", book: panel.book })}
        />
      ) : null}
      {panel?.kind === "finish" ? <FinishSheet book={panel.book} today={today} onClose={close} onDone={done} /> : null}
      {panel?.kind === "delete" ? <DeleteSheet book={panel.book} onClose={close} onDone={done} /> : null}
      <Toast message={toast} />
    </div>
  );
}

function Section({ id, label, empty, children }: { id: string; label: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="section-label text-muted">
        {label}
      </h2>
      {children.length === 0 ? (
        <p className="text-small text-muted">{empty}</p>
      ) : (
        <Card>
          <ul className="-mb-px">{children}</ul>
        </Card>
      )}
    </section>
  );
}

function BookRow({ book, hint, onOpen }: { book: BookView; hint: React.ReactNode; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[60px] w-full items-center gap-3 border-b border-line px-4 py-3 text-left transition-colors duration-[120ms] hover:bg-field"
      >
        <Books size={20} weight="light" aria-hidden className="shrink-0 text-ink" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-body text-ink">{book.title}</span>
          <span className="truncate text-small text-muted">
            {book.author ? `${book.author} · ` : null}
            {hint}
          </span>
        </span>
        {book.pages > 0 ? (
          <span className="shrink-0 font-mono text-[14px] font-medium text-muted">{book.pages} pág.</span>
        ) : null}
      </button>
    </li>
  );
}

function BookFormSheet({
  book,
  onClose,
  onDone,
  onFinish,
  onDelete,
}: {
  book?: BookView;
  onClose: () => void;
  onDone: (message: string) => void;
  onFinish?: () => void;
  onDelete?: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(book?.title ?? "");
  const [author, setAuthor] = useState(book?.author ?? "");
  const [total, setTotal] = useState(book?.totalPages ? String(book.totalPages) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    const t = total.trim();
    if (t !== "" && !/^\d+$/.test(t)) return setError(`Las páginas del libro van de 1 a ${MAX_PAGES}.`);
    const input = { title, author: author.trim() === "" ? null : author, totalPages: t === "" ? null : Number(t) };
    setError(null);
    start(async () => {
      const r = book ? await updateBook(book.id, input) : await createBook(input);
      if (!r.ok) return setError(r.error);
      onDone(book ? "Libro guardado" : "Libro agregado");
      router.refresh();
    });
  }

  function backToReading() {
    if (!book) return;
    start(async () => {
      const r = await setBookFinished(book.id, null);
      if (!r.ok) return setError(r.error);
      onDone("Volvió a Leyendo");
      router.refresh();
    });
  }

  return (
    <Sheet open title={book ? "Editar libro" : "Nuevo libro"} onClose={onClose} tall>
      <div className="flex flex-col gap-4 pb-1">
        <Input label="Título" name="title" value={title} maxLength={MAX_BOOK_TITLE} onChange={(e) => setTitle(e.target.value)} />
        <Input
          label="Autor (opcional)"
          name="author"
          value={author}
          maxLength={MAX_BOOK_AUTHOR}
          onChange={(e) => setAuthor(e.target.value)}
        />
        <Input
          label="Páginas del libro (opcional)"
          name="total"
          inputMode="numeric"
          className="font-mono"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
        />
        <ErrorLine error={error} />
        <Button onClick={save} disabled={pending}>
          Guardar
        </Button>
        {book ? (
          <>
            {book.status === "reading" ? (
              <Button variant="secondary" onClick={onFinish} disabled={pending}>
                Marcar terminado
              </Button>
            ) : (
              <Button variant="secondary" onClick={backToReading} disabled={pending}>
                Volver a Leyendo
              </Button>
            )}
            <Button variant="ghost" onClick={onDelete} disabled={pending}>
              Borrar libro
            </Button>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}

function FinishSheet({
  book,
  today,
  onClose,
  onDone,
}: {
  book: BookView;
  today: LocalDate;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState<string>(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    if (date > today) return setError("La fecha no puede ser futura.");
    setError(null);
    start(async () => {
      const r = await setBookFinished(book.id, date as LocalDate);
      if (!r.ok) return setError(r.error);
      onDone(`Terminaste ${book.title}`);
      router.refresh();
    });
  }

  return (
    <Sheet open title="Marcar terminado" onClose={onClose}>
      <p className="text-body text-muted">{book.title}</p>
      <Input
        label="Lo terminaste el"
        name="finished-on"
        type="date"
        max={today}
        value={date}
        className="font-mono"
        onChange={(e) => setDate(e.target.value)}
      />
      <ErrorLine error={error} />
      <Button onClick={save} disabled={pending || date === ""}>
        Marcar terminado
      </Button>
    </Sheet>
  );
}

function DeleteSheet({ book, onClose, onDone }: { book: BookView; onClose: () => void; onDone: (m: string) => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function remove() {
    start(async () => {
      const r = await deleteBook(book.id);
      if (!r.ok) return setError(r.error);
      onDone("Libro borrado");
      router.refresh();
    });
  }

  return (
    <Sheet open title={`¿Borrar ${book.title}?`} onClose={onClose}>
      <p className="text-body text-muted">{bookDeleteCopy(book.readings, book.pages)}</p>
      <ErrorLine error={error} />
      <Button onClick={remove} disabled={pending}>
        Borrar
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Cancelar
      </Button>
    </Sheet>
  );
}
