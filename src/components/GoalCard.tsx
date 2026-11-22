"use client";

import { Archive } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { archiveGoal } from "@/app/(app)/metas/actions";
import { IconButton } from "@/components/ui/IconButton";
import { ProgressRing } from "@/components/ui/ProgressRing";

export type GoalView = {
  id: string;
  title: string;
  kind: "weekly" | "total";
  current: number;
  target: number;
  status: "in_progress" | "done" | "overdue";
  /** Short text under the title for total goals ("37 de 100 · faltan 63 · hasta el 30 jun 2027"). */
  detail?: string;
  /** Right-hand label for weekly goals ("1 de 4"). */
  progressLabel?: string;
};

const STATUS_LABEL = { done: "Cumplida", overdue: "Vencida", in_progress: "" } as const;

/** One goal row. Weekly: name, "1 de 4" and a bar. Total: name, detail and a progress ring. */
export function GoalCard({ goal, archivable = true }: { goal: GoalView; archivable?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const pct = goal.target === 0 ? 0 : Math.min(100, (goal.current / goal.target) * 100);
  const status = STATUS_LABEL[goal.status];

  function archive() {
    setError(null);
    start(async () => {
      const r = await archiveGoal(goal.id);
      if (!r.ok) setError(r.error);
    });
  }

  const archiveButton = archivable ? (
    <IconButton label={`Archivar meta ${goal.title}`} onClick={archive} disabled={busy}>
      <Archive size={20} weight="light" aria-hidden />
    </IconButton>
  ) : null;

  return (
    <div className="flex flex-col gap-1 py-3">
      {goal.kind === "weekly" ? (
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-body font-medium text-ink">{goal.title}</p>
              <p className="shrink-0 font-mono text-small text-muted">
                {goal.progressLabel ?? `${goal.current} de ${goal.target}`}
                {status ? ` · ${status}` : ""}
              </p>
            </div>
            <div
              role="progressbar"
              aria-label={`Progreso de ${goal.title}`}
              aria-valuemin={0}
              aria-valuemax={goal.target}
              aria-valuenow={Math.min(goal.current, goal.target)}
              className="h-[6px] overflow-hidden rounded-full bg-ink-soft"
            >
              <div className="h-[6px] rounded-[3px] bg-accent" style={{ width: `${pct}%` }} />
            </div>
          </div>
          {archiveButton}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
            <p className="text-body font-medium text-ink">{goal.title}</p>
            <p className="font-mono text-small text-muted">
              {goal.detail}
              {status ? ` · ${status}` : ""}
            </p>
          </div>
          <ProgressRing value={pct} label={`${Math.round(pct)}% de ${goal.title}`} />
          {archiveButton}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-small text-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
