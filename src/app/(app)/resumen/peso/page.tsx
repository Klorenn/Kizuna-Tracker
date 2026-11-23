import { CaretLeft, LockSimple } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loadWeights } from "@/app/(app)/perfil/body-data";
import { WeightLine } from "@/components/charts/WeightLine";
import { BodyEntryList } from "@/components/profile/BodyEntryList";
import { RANGES, entryDateLabel, monthRowLabel, parseRange, rangeFrom } from "@/components/profile/body-view";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import {
  formatKg1,
  formatSignedKg1,
  monthlyWeightSummary,
  weightSeries,
  type WeightEntry,
} from "@/domain/body";
import { monthOf, withSearch } from "@/domain/calendar";
import { localDate } from "@/domain/dates";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Peso" };

const STEP = 20;

type Search = { rango?: string | string[]; n?: string | string[] };

/** Private weight drill-down. Solo tú: only the signed-in owner's rows are ever read. */
export default async function PesoPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/login?error=perfil");

  const today = localDate(new Date(), profile.timezone);
  const range = parseRange(sp.rango);
  const from = rangeFrom(range, today);
  const loaded = await loadWeights(supabase, user.id, from);
  if (!loaded.ok) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 px-5 pb-10 pt-1">
        <h1 className="text-display font-semibold text-ink">Peso</h1>
        <EmptyState
          title="No pudimos cargar tu peso"
          body="Revisa tu conexión y vuelve a intentarlo."
          action={
            <ButtonLink href="/resumen/peso" variant="secondary">
              Reintentar
            </ButtonLink>
          }
        />
      </main>
    );
  }
  const { rows, before } = loaded;

  const asc: WeightEntry[] = rows.map((r) => ({ date: r.date, kg: r.kg })).reverse();
  const series = weightSeries(asc, from ?? "0000-01-01", today);
  const latest = rows[0] ?? null;
  const delta = series.length >= 2 ? series[series.length - 1].kg - series[0].kg : null;

  const months = [...new Set(rows.map((r) => monthOf(r.date)))];
  const summary = monthlyWeightSummary(before ? [before, ...asc] : asc, months);

  const requested = Number(Array.isArray(sp.n) ? sp.n[0] : sp.n);
  const shown = Math.min(rows.length, Number.isInteger(requested) && requested >= STEP ? requested : STEP);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-5 pb-10 pt-1">
      <div className="flex flex-col gap-1">
        <Link href="/resumen" className="-ml-1 flex h-11 w-fit items-center gap-1 pr-2 text-[17px] text-accent">
          <CaretLeft size={20} weight="light" aria-hidden />
          Resumen
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="flex-1 text-display font-semibold text-ink">Peso</h1>
          <span className="section-label inline-flex items-center gap-1 text-muted">
            <LockSimple size={14} weight="light" aria-hidden />
            Solo tú
          </span>
        </div>
      </div>

      <nav aria-label="Periodo" className="flex gap-2">
        {RANGES.map((r) => {
          const selected = r.value === range;
          return (
            <Link
              key={r.value}
              href={withSearch("/resumen/peso", { rango: r.value === "6m" ? null : r.value })}
              aria-current={selected ? "page" : undefined}
              replace
              scroll={false}
              className={`inline-flex h-11 items-center rounded-full px-3 text-small font-medium transition-colors duration-[120ms] ${
                selected
                  ? "border-[1.5px] border-accent bg-accent-soft px-[10.5px] text-accent"
                  : "bg-field text-ink"
              }`}
            >
              {r.label}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <Card className="flex flex-col items-start gap-4 p-4">
          <p className="text-body text-muted">
            {range === "todo" ? "Aún no registras tu peso." : "No hay registros en este periodo."}
          </p>
          <ButtonLink href="/perfil" variant="secondary" className="w-auto!">
            Ir a Perfil
          </ButtonLink>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-4 p-4">
            <div className="flex items-end gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="text-small text-muted">Último registro · {entryDateLabel(latest!.date, today)}</p>
                <p className="font-mono text-[36px] font-semibold leading-none tracking-[-0.02em] text-ink">
                  {formatKg1(latest!.kg)}
                </p>
              </div>
              {delta !== null ? (
                <div className="flex flex-col items-end gap-1.5">
                  <p className="text-small text-muted">En el periodo</p>
                  <p className="font-mono text-[17px] font-semibold text-ink">{formatSignedKg1(delta)}</p>
                </div>
              ) : null}
            </div>
            <WeightLine data={series} today={today} />
          </Card>

          <section aria-labelledby="peso-meses" className="flex flex-col gap-2">
            <h2 id="peso-meses" className="section-label text-muted">
              Por mes
            </h2>
            <Card>
              <ul className="divide-y divide-line">
                {summary.map((m) => (
                  <li key={m.month} className="flex min-h-[60px] items-center gap-3 px-4 py-2">
                    <span className="min-w-0 flex-1 text-body text-ink">{monthRowLabel(m.month)}</span>
                    <span className="flex flex-col items-end gap-0.5">
                      <span className="font-mono text-[17px] font-semibold leading-tight text-ink">
                        {m.last === null ? "—" : formatKg1(m.last)}
                      </span>
                      <span className="font-mono text-small leading-tight text-muted">
                        {m.change === null ? "—" : formatSignedKg1(m.change)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section aria-labelledby="peso-registros" className="flex flex-col gap-2">
            <h2 id="peso-registros" className="section-label flex h-6 items-center gap-2 text-muted">
              <span className="flex-1">Registros</span>
              <span>{rows.length}</span>
            </h2>
            <Card>
              <BodyEntryList entries={rows.slice(0, shown)} today={today} />
              {shown < rows.length ? (
                <Link
                  href={withSearch("/resumen/peso", { rango: range === "6m" ? null : range, n: String(shown + STEP) })}
                  scroll={false}
                  className="flex min-h-[52px] items-center justify-center border-t border-line px-4 text-body font-medium text-accent transition-colors duration-[120ms] hover:bg-field"
                >
                  Ver más
                </Link>
              ) : null}
            </Card>
          </section>
        </>
      )}
    </main>
  );
}
