import { BookOpen, Lock, PencilSimple, Plus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { formatKg1 } from "@/domain/body";
import { formatKg, logSubtitle, type LogType } from "@/domain/logs";
import type { LocalDate } from "@/domain/types";
import type { DayLog } from "@/lib/logs-data";

/** Where to add or edit the log of a habit on a day (pages owned by the entry screens). */
export function logEntryHref(habitId: string, logType: Exclude<LogType, "none">, date: LocalDate): string {
  return `/habitos/${habitId}/${logType === "reading" ? "lectura" : "entrenamiento"}?fecha=${date}`;
}

const setText = (s: { reps: number; kg: number }) => `${s.reps} × ${formatKg(s.kg)}`;

/**
 * The detail of one day's log under its habit in the calendar day sheet: the book and pages,
 * or the day types and every exercise with its sets. Plus "Editar" / "Añadir registro".
 */
export function DayLogDetail({
  log,
  habitId,
  logType,
  date,
}: {
  log: DayLog | null;
  habitId: string;
  logType: Exclude<LogType, "none">;
  date: LocalDate;
}) {
  const href = logEntryHref(habitId, logType, date);
  const action = (
    <Link
      href={href}
      className="-ml-1 inline-flex h-11 items-center gap-1.5 self-start rounded-md px-1 text-small font-medium text-accent"
    >
      {log ? <PencilSimple size={16} weight="light" aria-hidden /> : <Plus size={16} weight="light" aria-hidden />}
      {log ? "Editar" : "Añadir registro"}
    </Link>
  );

  if (!log) return action;

  if (log.kind === "reading") {
    return (
      <div className="flex flex-col gap-0.5">
        <p className="flex min-w-0 items-center gap-1.5 text-small text-ink">
          <BookOpen size={16} weight="light" aria-hidden className="shrink-0" />
          <span className="truncate">{log.bookTitle}</span>
          {log.finishedBook ? (
            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-label text-ink">Terminado</span>
          ) : null}
        </p>
        <p className="font-mono text-small text-muted">
          {log.fromPage} → {log.toPage} · {log.pages} {log.pages === 1 ? "página" : "páginas"}
        </p>
        {action}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-small text-ink">{logSubtitle({ kind: "workout", dayTypes: log.dayTypes, exerciseCount: 0 })}</p>
      {log.exercises.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {log.exercises.map((e, i) => (
            <li key={`${e.name}-${i}`} className="flex flex-col">
              <span className="text-small text-ink">{e.name}</span>
              <span className="font-mono text-small text-muted">{e.sets.map(setText).join(" · ")}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {log.volumeKg > 0 ? (
        <p className="text-small text-muted">
          Volumen <span className="font-mono">{formatKg(log.volumeKg)}</span>
        </p>
      ) : null}
      {action}
    </div>
  );
}

/** The day's weigh-in, private: only ever rendered on the owner's own calendar. */
export function WeightRow({ kg }: { kg: number }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-md bg-field text-ink">
        <Lock size={20} weight="light" />
      </span>
      <p className="min-w-0 flex-1 text-body text-ink">
        Peso · <span className="font-mono">{formatKg1(kg)}</span>
      </p>
      <p className="shrink-0 text-small text-muted">Solo tú</p>
    </div>
  );
}
