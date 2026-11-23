"use client";

import { Plus, Warning } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { createBook } from "@/app/(app)/registros/actions";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { MAX_BOOK_TITLE, MAX_PAGES } from "@/domain/logs";
import type { PickerBook } from "@/lib/reading-books";

/**
 * Chips of the books you are reading (last used first) plus "Nuevo libro", which opens an inline
 * form (title, optional total pages). With no books the form starts open.
 */
export function BookPicker({
  books,
  value,
  onChange,
  onCreated,
}: {
  books: PickerBook[];
  value: string | null;
  onChange: (id: string) => void;
  onCreated: (book: PickerBook) => void;
}) {
  const [adding, setAdding] = useState(books.length === 0);
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    const t = total.trim();
    if (t !== "" && !/^\d+$/.test(t)) return setError(`Las páginas del libro van de 1 a ${MAX_PAGES}.`);
    const totalPages = t === "" ? null : Number(t);
    setError(null);
    start(async () => {
      const r = await createBook({ title, author: null, totalPages });
      if (!r.ok) return setError(r.error);
      onCreated({ id: r.id, title: title.trim(), totalPages, nextFrom: 0 });
      setTitle("");
      setTotal("");
      setAdding(false);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="section-label text-muted">LIBRO</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Libro">
        {books.map((b) => (
          <Chip key={b.id} selected={b.id === value} onClick={() => onChange(b.id)} className="max-w-full">
            <span className="truncate">{b.title}</span>
          </Chip>
        ))}
        <Chip
          selected={adding}
          aria-expanded={adding}
          icon={<Plus size={16} weight="light" aria-hidden />}
          onClick={() => setAdding((a) => !a)}
        >
          Nuevo libro
        </Chip>
      </div>
      {adding ? (
        <div className="flex flex-col gap-3 rounded-md bg-field p-3">
          <Input
            label="Título"
            name="book-title"
            value={title}
            maxLength={MAX_BOOK_TITLE}
            placeholder="Dune"
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            label="Páginas totales (opcional)"
            name="book-total"
            inputMode="numeric"
            value={total}
            className="font-mono"
            onChange={(e) => setTotal(e.target.value)}
          />
          {error ? (
            <p role="alert" className="flex items-center gap-1 text-small text-ink">
              <Warning size={16} weight="light" className="shrink-0 text-alert" aria-hidden />
              {error}
            </p>
          ) : null}
          <Button variant="secondary" onClick={add} disabled={pending}>
            Agregar libro
          </Button>
        </div>
      ) : null}
    </div>
  );
}
