import type { Metadata } from "next";
import Link from "next/link";
import { ComparisonBars } from "@/components/charts/ComparisonBars";
import { MonthStepper } from "@/components/logs/MonthStepper";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { dayLabel, monthOf, shiftMonth } from "@/domain/calendar";
import { lastMonths, monthlyReading, pagesRead, readingSeries } from "@/domain/logs";
import { loadReadingData } from "@/lib/logs-data";
import { RangeToggle } from "../RangeToggle";
import {
  DetailHeader,
  Stat,
  colorOf,
  compactNumber,
  dataFrom,
  loadLogsContext,
  monthName,
  parseRange,
  resolveMonth,
  stepper,
} from "../logs-view";

export const metadata: Metadata = { title: "Lectura" };

export default async function LecturaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string | string[]; rango?: string | string[] }>;
}) {
  const { mes, rango } = await searchParams;
  const ctx = await loadLogsContext();
  const month = resolveMonth(mes, ctx.current);
  const range = parseRange(rango);
  const { books, entries } = await loadReadingData(ctx.supabase, ctx.userId, dataFrom(month, range));
  const color = colorOf(ctx.readingHabit);

  const now = monthlyReading(entries, books, month);
  const prev = monthlyReading(entries, books, shiftMonth(month, -1));
  const months = lastMonths(month, range);
  const series = readingSeries(entries, books, months);
  const titles = new Map(books.map((b) => [b.id, b.title]));
  const list = entries
    .filter((e) => monthOf(e.date) === month)
    .sort((a, b) => b.date.localeCompare(a.date) || b.toPage - a.toPage);
  const nav = stepper("/resumen/lectura", month, ctx.current, range);
  const prevName = monthName(shiftMonth(month, -1));

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <DetailHeader title="Lectura" />
      <MonthStepper month={month} {...nav} />

      <Card className="flex gap-3 p-4">
        <Stat label="Páginas" value={now.pages} caption={`${prevName}: ${prev.pages}`} />
        <Stat label="Días" value={now.days} caption={`${prevName}: ${prev.days}`} />
        <Stat label="Libros" value={now.booksFinished.length} caption={`${prevName}: ${prev.booksFinished.length}`} />
      </Card>

      <RangeToggle value={range} />

      <SectionHeader label="Páginas por mes" />
      <Card className="p-4">
        <ComparisonBars
          data={series.map((s) => ({ month: s.month, value: s.pages }))}
          color={color}
          format={compactNumber}
          label="Páginas por mes"
          current={month}
        />
      </Card>

      <SectionHeader label="Libros terminados por mes" />
      <Card className="p-4">
        <ComparisonBars
          data={series.map((s) => ({ month: s.month, value: s.books }))}
          color={color}
          format={compactNumber}
          label="Libros terminados por mes"
          current={month}
        />
      </Card>

      <SectionHeader label="Terminados" action="Libros" href="/libros" />
      <Card className="p-4">
        {now.booksFinished.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {now.booksFinished.map((b) => (
              <li key={b.id} className="text-body text-ink">
                {b.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-muted">Ningún libro terminado este mes.</p>
        )}
      </Card>

      <SectionHeader label="Lecturas del mes" />
      {list.length > 0 ? (
        <Card>
          <ul className="flex flex-col">
            {list.map((e, i) => (
              <li key={`${e.date}-${i}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body text-ink">{titles.get(e.bookId) ?? "Libro"}</p>
                  <p className="text-small text-muted">{dayLabel(e.date)}</p>
                </div>
                <p className="shrink-0 text-right font-mono text-small text-muted">
                  {e.fromPage} → {e.toPage}
                  <br />
                  <span className="text-ink">{pagesRead(e)} pág.</span>
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <EmptyState
            title="Todavía no hay lecturas este mes."
            body="Cuando registres qué leíste, lo verás aquí."
            action={
              ctx.readingHabit ? (
                <Link href={`/habitos/${ctx.readingHabit.id}`} className="inline-flex h-11 items-center text-small font-medium text-accent">
                  Ir al hábito
                </Link>
              ) : undefined
            }
          />
        </Card>
      )}
    </main>
  );
}
