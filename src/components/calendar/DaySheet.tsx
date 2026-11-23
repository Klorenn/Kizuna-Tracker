"use client";

import { CheckCircle, CircleHalf, Clock, ImageBroken, MinusCircle, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import type { RefObject } from "react";
import { DayLogDetail, WeightRow } from "@/components/logs/DayLogDetail";
import { Sheet } from "@/components/ui/Sheet";
import { HabitIcon } from "@/components/habit-icon";
import { dayHeading } from "@/domain/calendar";
import type { HabitColor } from "@/domain/habit-colors";
import type { LogType } from "@/domain/logs";
import type { IconKey } from "@/domain/presets";
import type { LocalDate } from "@/domain/types";
import { hasRecords, type HabitDay } from "@/lib/calendar-days";
import { REJECT_LABEL } from "@/lib/challenge-form";
import { useSignedUrls } from "@/lib/use-signed-urls";

export type CalendarHabitView = {
  id: string;
  name: string;
  color: HabitColor;
  icon: string;
  /** Habits with a detailed log show it (or "Añadir registro") on days with a check-in. */
  logType?: LogType;
};

function Status({ entry }: { entry: HabitDay }) {
  const row = "flex items-center gap-1.5 text-small";
  switch (entry.status) {
    case "done":
      return (
        <p className={`${row} text-ink`}>
          <CheckCircle size={16} weight="light" aria-hidden />
          Hecho
        </p>
      );
    case "partial":
      return (
        <p className={`${row} text-ink`}>
          <CircleHalf size={16} weight="light" aria-hidden />
          En progreso
        </p>
      );
    case "rejected":
      return (
        <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-alert-soft py-0.5 pl-2 pr-2.5 text-small text-ink">
          <WarningCircle size={16} weight="light" className="text-alert" aria-hidden />
          Rechazada · {REJECT_LABEL[entry.rejectReason ?? "other"]}
        </p>
      );
    case "pending":
      return (
        <p className={`${row} text-muted`}>
          <Clock size={16} weight="light" aria-hidden />
          Pendiente
        </p>
      );
    default:
      return (
        <p className={`${row} text-muted`}>
          <MinusCircle size={16} weight="light" aria-hidden />
          No registrado
        </p>
      );
  }
}

function Thumb({ url, alt, label }: { url: string | null | undefined; alt: string; label: string | null }) {
  return (
    <figure className="flex w-16 flex-col gap-1">
      <span className="relative flex size-16 items-center justify-center overflow-hidden rounded-md border border-line bg-field text-muted">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={url} alt={alt} className="absolute inset-0 size-full object-cover" />
        ) : url === null ? (
          <>
            <ImageBroken size={20} weight="light" aria-hidden />
            <span className="sr-only">Foto no disponible</span>
          </>
        ) : (
          <span className="sr-only">Cargando foto</span>
        )}
      </span>
      {label ? <figcaption className="truncate text-label text-muted">{label}</figcaption> : null}
    </figure>
  );
}

/** Day detail: every habit of that day with its status, items, time and proof photos. */
export function DaySheet({
  date,
  today,
  entries,
  habits,
  single,
  onClose,
  returnFocusRef,
  weightKg,
}: {
  date: LocalDate;
  today: LocalDate;
  entries: HabitDay[];
  habits: CalendarHabitView[];
  /** Habit detail page: one habit, no need to repeat its name as a list. */
  single: boolean;
  onClose: () => void;
  /** The tapped day cell: focus goes back there on close. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** That day's weigh-in. Private: pass it only on the owner's own calendar. */
  weightKg?: number | null;
}) {
  const byId = new Map(habits.map((h) => [h.id, h]));
  const records = hasRecords(entries);
  const shown = records ? entries : [];
  const urls = useSignedUrls(shown.flatMap((e) => e.photos.map((p) => p.path)));
  const title = dayHeading(date, today);

  return (
    <Sheet open title={title} onClose={onClose} returnFocusRef={returnFocusRef}>
      <div className="-mx-5 max-h-[min(62dvh,560px)] overflow-y-auto px-5">
        {records ? (
          <ul className="flex flex-col divide-y divide-line">
            {shown.map((e) => {
              const habit = byId.get(e.habitId);
              if (!habit) return null;
              return (
                <li key={e.habitId} data-habit-color={habit.color} className="flex gap-3 py-3 first:pt-0">
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-md bg-(--habit-soft) text-ink ring-[1.5px] ring-inset ring-(--habit)"
                  >
                    <HabitIcon name={habit.icon as IconKey} size={20} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-baseline gap-2">
                      <p className="min-w-0 flex-1 truncate text-body font-medium text-ink">{habit.name}</p>
                      {e.time ? (
                        <p className="shrink-0 font-mono text-small text-muted">
                          <span className="sr-only">a las </span>
                          {e.time}
                        </p>
                      ) : null}
                    </div>
                    <Status entry={e} />
                    {e.items ? (
                      <p className="text-small text-muted">
                        <span className="text-ink">
                          <span className="font-mono">{e.items.done}</span> de{" "}
                          <span className="font-mono">{e.items.total}</span>
                        </span>
                        : {e.items.labels.join(", ")}
                      </p>
                    ) : null}
                    {habit.logType &&
                    habit.logType !== "none" &&
                    (e.status === "done" ||
                      e.status === "rejected" ||
                      // sums under the goal: no check-in yet, but the day has its list of sums
                      (habit.logType === "quantity" && e.log?.kind === "quantity")) ? (
                      <DayLogDetail
                        log={e.log}
                        habitId={habit.id}
                        logType={habit.logType}
                        date={date}
                        isToday={date === today}
                        hasCheckin={e.status === "done" || e.status === "rejected"}
                      />
                    ) : null}
                    {e.photos.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {e.photos.map((p) => (
                          <Thumb
                            key={p.path}
                            url={urls[p.path]}
                            alt={`Foto de ${habit.name}${p.label ? `, ${p.label}` : ""}`}
                            label={p.label}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {weightKg != null ? (
              <li>
                <WeightRow kg={weightKg} />
              </li>
            ) : null}
          </ul>
        ) : weightKg != null ? (
          // only a weigh-in that day: it is a record, so no "Sin registros" message
          <WeightRow kg={weightKg} />
        ) : (
          <div className="flex flex-col items-center gap-1 pb-4 pt-2 text-center">
            <p className="text-body font-medium text-ink">Sin registros este día</p>
            {date === today ? (
              <Link href="/" className="inline-flex h-11 items-center text-small font-medium text-accent">
                Ir a Hoy para marcar
              </Link>
            ) : (
              <p className="text-small text-muted">
                {single && habits[0] ? `No marcaste ${habits[0].name} este día.` : "No marcaste ningún hábito."}
              </p>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
