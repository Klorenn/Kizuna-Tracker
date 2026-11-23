"use client";

/**
 * HistoryList: "Semanas anteriores", the closed weeks of a group, and the sheet of one week.
 *
 * Props: `weeks` (GroupWeek[] | null: null = the read failed), `groupId`, `actions` (`Pick<GroupActions,
 * "loadWeek">`), `retryHref`, `color` (group colour key). Tapping a week opens a sheet that loads its
 * rows through `actions.loadWeek` (states: loading, error with retry, rows).
 * Of each member the sheet shows name, @usuario, avatar and that week's count, nothing else.
 */
import { CaretRight, Check, Minus } from "@phosphor-icons/react";
import { memo, useEffect, useRef, useState } from "react";
import { LoadFailed } from "@/components/LoadFailed";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Sheet } from "@/components/ui/Sheet";
import { toHabitColor } from "@/domain/habit-colors";
import { CONNECTION_ERROR, safeAction } from "@/lib/safe-action";
import type { GroupActions, GroupDate, GroupResult, GroupWeek, GroupWeekRow } from "@/lib/groups-contract";
import { weekRange } from "./group-logic";
import { ErrorLine, Mono, PersonLink } from "./parts";

export type WeekState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; rows: GroupWeekRow[] };

/** One load of a week's rows: a failed result and a thrown call are both an error state. */
export async function loadWeekState(
  loadWeek: (groupId: string, weekStart: GroupDate) => Promise<GroupResult<GroupWeekRow[]>>,
  groupId: string,
  weekStart: GroupDate,
): Promise<WeekState> {
  const r = await safeAction(() => loadWeek(groupId, weekStart));
  if (!r.ok) return { status: "error", error: r.error || CONNECTION_ERROR };
  return r.value.ok ? { status: "ready", rows: r.value.data } : { status: "error", error: r.value.error };
}

function Result({ complied, label }: { complied: boolean; label: string }) {
  const Icon = complied ? Check : Minus;
  return (
    <span
      className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-small font-medium text-ink ${
        complied ? "bg-(--habit-soft)" : "bg-field"
      }`}
    >
      <Icon size={14} weight="light" aria-hidden />
      {label}
    </span>
  );
}

const WeekRow = memo(function WeekRow({ week, onOpen }: { week: GroupWeek; onOpen: (w: GroupWeek) => void }) {
  return (
    <li>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => onOpen(week)}
        className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-offset-[-2px]"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-body font-medium text-ink">{weekRange(week.weekStart)}</span>
          <span className="text-small text-muted">
            Cumplieron <Mono>{week.membersComplied}</Mono> de <Mono>{week.membersCounted}</Mono>
          </span>
        </span>
        {week.myComplied === null ? (
          <span className="shrink-0 text-small text-muted">Aún no estabas</span>
        ) : (
          <Result complied={week.myComplied} label={week.myComplied ? "Cumpliste" : "No cumpliste"} />
        )}
        <CaretRight size={16} weight="light" aria-hidden className="shrink-0 text-muted" />
      </button>
    </li>
  );
});

const SheetRow = memo(function SheetRow({ row }: { row: GroupWeekRow }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <PersonLink person={row} />
      <div className="flex w-28 shrink-0 flex-col items-end gap-1 text-right">
        <span className="text-small text-ink">
          <Mono>{row.done}</Mono> de <Mono>{row.target}</Mono>
        </span>
        <span className="flex h-6 items-center">{row.complied ? <Result complied label="Cumplió" /> : null}</span>
      </div>
    </li>
  );
});

/** The week sheet's body for each state (the sheet itself only mounts while open). */
export function WeekRowsView({
  state,
  onRetry,
  color,
}: {
  state: WeekState;
  onRetry: () => void;
  color: string;
}) {
  if (state.status === "loading")
    return (
      <p role="status" aria-busy="true" className="py-6 text-center text-small text-muted">
        Cargando…
      </p>
    );
  if (state.status === "error")
    return (
      <div className="flex flex-col gap-3">
        <ErrorLine>{state.error}</ErrorLine>
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    );
  return (
    <Card data-habit-color={toHabitColor(color)} className="min-h-0">
      <ul className="divide-y divide-line">
        {state.rows.map((r) => (
          <SheetRow key={r.userId} row={r} />
        ))}
      </ul>
    </Card>
  );
}

function WeekSheet({
  week,
  groupId,
  loadWeek,
  color,
  onClose,
}: {
  week: GroupWeek;
  groupId: string;
  loadWeek: GroupActions["loadWeek"];
  color: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<WeekState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const weekStart = week.weekStart;
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    loadWeekState(loadWeek, groupId, weekStart).then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, [groupId, weekStart, attempt]);
  return (
    <Sheet open title={weekRange(week.weekStart)} onClose={onClose} tall>
      <p className="text-small text-muted">
        Cumplieron <Mono>{week.membersComplied}</Mono> de <Mono>{week.membersCounted}</Mono>
      </p>
      <WeekRowsView state={state} onRetry={() => setAttempt((n) => n + 1)} color={color} />
    </Sheet>
  );
}

export function HistoryList({
  weeks,
  groupId,
  actions,
  retryHref,
  color,
}: {
  weeks: GroupWeek[] | null;
  groupId: string;
  actions: Pick<GroupActions, "loadWeek">;
  retryHref: string;
  color: string;
}) {
  const [open, setOpen] = useState<GroupWeek | null>(null);
  if (!weeks) return <LoadFailed href={retryHref} />;
  return (
    <section aria-label="Semanas anteriores" className="flex flex-col gap-2">
      <SectionHeader label="Semanas anteriores" />
      {weeks.length === 0 ? (
        <p className="text-body text-muted">Aún no hay semanas cerradas.</p>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {weeks.map((w) => (
              <WeekRow key={w.weekStart} week={w} onOpen={setOpen} />
            ))}
          </ul>
        </Card>
      )}
      {open ? (
        <WeekSheet week={open} groupId={groupId} loadWeek={actions.loadWeek} color={color} onClose={() => setOpen(null)} />
      ) : null}
    </section>
  );
}
