import {
  BookOpen,
  Drop,
  Lock,
  PencilSimple,
  PersonSimpleRun,
  Plus,
  Television,
  Timer,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { formatKg1 } from "@/domain/body";
import { CARDIO_KIND_LABEL, cardioSummary } from "@/domain/cardio";
import { bookProgress, formatKg, logSubtitle, type LogType } from "@/domain/logs";
import { formatAmount, progressLabel } from "@/domain/quantity";
import type { LocalDate } from "@/domain/types";
import type { DayLog } from "@/lib/logs-data";
import { logEntryHref, timeLine, watchLine } from "@/lib/log-text";

// Re-exported so the other screens keep importing it from here. The text helpers live in the
// pure `log-text` module: this client chunk must not pull the loaders of `logs-data`.
export { logEntryHref };
export type { EntryLogType } from "@/lib/log-text";

const setText = (s: { reps: number; kg: number }) => `${s.reps} × ${formatKg(s.kg)}`;

const lineClass = "flex min-w-0 items-center gap-1.5 text-small text-ink";

/**
 * The detail of one day's log under its habit in the calendar day sheet: the book and pages,
 * the day types and every exercise with its sets, the time, what was watched, the sums of a
 * quantity goal or each outing. Plus "Editar" / "Añadir registro".
 */
export function DayLogDetail({
  log,
  habitId,
  logType,
  date,
  isToday = false,
  hasCheckin = false,
}: {
  log: DayLog | null;
  habitId: string;
  logType: Exclude<LogType, "none">;
  date: LocalDate;
  /** Quantity sums are only edited from Hoy: on today the sheet points there. */
  isToday?: boolean;
  /** The day already has its check-in (the goal of that day was met). */
  hasCheckin?: boolean;
}) {
  const action =
    logType === "quantity" ? (
      isToday ? (
        <Link
          href="/"
          className="-ml-1 inline-flex h-11 items-center gap-1.5 self-start rounded-md px-1 text-small font-medium text-accent"
        >
          <PencilSimple size={16} weight="light" aria-hidden />
          Editar en Hoy
        </Link>
      ) : null
    ) : (
      <Link
        href={logEntryHref(habitId, logType, date)}
        className="-ml-1 inline-flex h-11 items-center gap-1.5 self-start rounded-md px-1 text-small font-medium text-accent"
      >
        {log ? <PencilSimple size={16} weight="light" aria-hidden /> : <Plus size={16} weight="light" aria-hidden />}
        {log ? "Editar" : "Añadir registro"}
      </Link>
    );

  if (!log) return action;

  if (log.kind === "reading") {
    // same format as PROGRESO and /libros: "página 40 de 412 · 10 %" (only with the total known)
    const progress = log.totalPages ? bookProgress(log.toPage, log.totalPages) : null;
    return (
      <div className="flex flex-col gap-0.5">
        <p className={lineClass}>
          <BookOpen size={16} weight="light" aria-hidden className="shrink-0" />
          <span className="truncate">{log.bookTitle}</span>
          {log.finishedBook ? (
            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-label text-ink">Terminado</span>
          ) : null}
        </p>
        <p className="font-mono text-small text-muted">
          {log.fromPage} → {log.toPage} · {log.pages} {log.pages === 1 ? "página" : "páginas"}
        </p>
        {progress ? <p className="font-mono text-small text-muted">{progress}</p> : null}
        {action}
      </div>
    );
  }

  if (log.kind === "time") {
    return (
      <div className="flex flex-col gap-0.5">
        <p className={lineClass}>
          <Timer size={16} weight="light" aria-hidden className="shrink-0" />
          <span className="min-w-0 break-words">{timeLine(log)}</span>
        </p>
        {action}
      </div>
    );
  }

  if (log.kind === "watch") {
    return (
      <div className="flex flex-col gap-0.5">
        <p className={lineClass}>
          <Television size={16} weight="light" aria-hidden className="shrink-0" />
          <span className="min-w-0 break-words">{watchLine(log)}</span>
        </p>
        {action}
      </div>
    );
  }

  if (log.kind === "quantity") {
    const pct = log.target > 0 ? Math.min(100, Math.round((log.total / log.target) * 100)) : 0;
    // The goal is today's: a past day that already has its check-in shows only what was drunk.
    const againstGoal = isToday || !hasCheckin;
    return (
      <div className="flex flex-col gap-1.5">
        <p className={lineClass}>
          <Drop size={16} weight="light" aria-hidden className="shrink-0" />
          <span className="font-mono">
            {againstGoal ? progressLabel(log.total, log.config) : formatAmount(log.total, log.config)}
          </span>
        </p>
        {againstGoal ? (
          <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-field">
            <div className="h-full rounded-full bg-(--habit)" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        <ul aria-label="Sumas del día" className="flex flex-col gap-0.5">
          {log.entries.map((e, i) => (
            <li key={`${e.time}-${i}`} className="flex items-baseline gap-2 text-small">
              <span className="w-12 shrink-0 font-mono text-muted">
                <span className="sr-only">a las </span>
                {e.time}
              </span>
              <span className="font-mono text-ink">+ {formatAmount(e.amount, log.config)}</span>
            </li>
          ))}
        </ul>
        {action}
      </div>
    );
  }

  if (log.kind === "cardio") {
    return (
      <div className="flex flex-col gap-0.5">
        <ul className="flex flex-col gap-0.5">
          {log.entries.map((e) => (
            <li key={e.id} className={lineClass}>
              <PersonSimpleRun size={16} weight="light" aria-hidden className="shrink-0" />
              <span className="min-w-0 break-words">
                {CARDIO_KIND_LABEL[e.kind]} · {cardioSummary([e])}
              </span>
            </li>
          ))}
        </ul>
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
