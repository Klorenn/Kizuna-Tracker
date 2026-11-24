import { useState } from "react";
import { Text, View } from "react-native";
import type { BookInput } from "@/domain/logs";
import { logSubtitle } from "@/domain/logs";
import type { TodayRow } from "@/domain/today";
import type { PickerBook } from "@/lib/reading-books";
import { READING_ERRORS, checkReadingPages, type ReadingInput } from "@/lib/reading-copy";
import { useTheme } from "../theme/ThemeProvider";
import { Chip, Chips, Cta, Field, Muted, NotFound, Outcome, Screen, Title, Toggle, intOf, useAction, type ActionResult } from "./ui";

type Props = {
  row: TodayRow | null;
  books: PickerBook[];
  onSave: (entry: ReadingInput) => Promise<ActionResult>;
  /** checks the habit in with no reading */
  onMark: () => Promise<ActionResult>;
  onDelete: () => Promise<ActionResult>;
  onCreateBook: (input: BookInput) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  onBack: () => void;
};

/** Today's reading of one habit: pick a book, the pages, "Terminé el libro", or just check the habit in. */
export function ReadingPanel({ row, books, onSave, onMark, onDelete, onCreateBook, onBack }: Props) {
  const { colors, space } = useTheme();
  const act = useAction();
  const [bookId, setBookId] = useState<string | null>(books[0]?.id ?? null);
  const book = books.find((b) => b.id === bookId) ?? books[0] ?? null;
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [finished, setFinished] = useState(false);
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("");
  if (!row) return <NotFound onBack={onBack} />;
  const today = row.log?.kind === "reading" ? row.log : null;
  const fromText = from ?? String(book?.nextFrom ?? 0);

  const pick = (b: PickerBook) => {
    setBookId(b.id);
    setFrom(String(b.nextFrom));
    act.clear();
  };
  const save = () => {
    if (!book) return act.fail("Agrega un libro para registrar lo que lees.");
    const entry: ReadingInput = { bookId: book.id, fromPage: Number(fromText), toPage: Number(to), finished };
    const valid = intOf(fromText) === null || intOf(to) === null ? ({ ok: false, error: READING_ERRORS.invalid_pages } as const) : checkReadingPages(entry);
    if (!valid.ok) return act.fail(valid.error);
    void act.run(() => onSave(entry));
  };
  const addBook = async () => {
    const pages = total.trim() === "" ? null : intOf(total);
    const r = await onCreateBook({ title, author: null, totalPages: pages ?? (total.trim() === "" ? null : -1) });
    if (!r.ok) return act.fail(r.error);
    act.clear();
    setTitle("");
    setTotal("");
    setBookId(r.id);
    setFrom("0");
  };

  return (
    <Screen onBack={onBack}>
      <Title>{row.name}</Title>
      <Muted>{today ? logSubtitle(today) : "Hoy aún no registras lectura"}</Muted>
      {books.length === 0 ? (
        <Text style={{ color: colors.text, fontSize: 15 }}>Agrega un libro para registrar lo que lees.</Text>
      ) : (
        <Chips>
          {books.map((b) => (
            <Chip key={b.id} label={b.title} accessibilityLabel={`Libro ${b.title}`} selected={b.id === book?.id} onPress={() => pick(b)} />
          ))}
        </Chips>
      )}
      <View style={{ gap: space.sm }}>
        <Field label="Título del libro" value={title} onChangeText={setTitle} />
        <Field label="Páginas totales" value={total} onChangeText={setTotal} keyboardType="number-pad" />
        <Cta label="Agregar libro" onPress={() => void addBook()} />
      </View>
      {book ? (
        <>
          <Field label="Desde la página" value={fromText} onChangeText={(t) => { setFrom(t); act.clear(); }} keyboardType="number-pad" />
          <Field label="Hasta la página" value={to} onChangeText={(t) => { setTo(t); act.clear(); }} keyboardType="number-pad" />
          <Toggle label="Terminé el libro" value={finished} onChange={setFinished} />
          <Cta label="Guardar" primary disabled={act.busy} onPress={save} />
        </>
      ) : null}
      <Outcome error={act.error} done={act.done} />
      <Cta label="Solo marcar" disabled={act.busy} onPress={() => void act.run(onMark)} />
      {today ? <Cta label="Quitar lectura" disabled={act.busy} onPress={() => void act.run(onDelete)} /> : null}
    </Screen>
  );
}
