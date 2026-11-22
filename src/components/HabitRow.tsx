"use client";

import { Camera, Check, Warning } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { checkIn, undoCheckIn } from "@/app/(app)/habitos/actions";
import { habitSubtitle, type TodayRow } from "@/domain/today";
import { ItemChecklist } from "./ItemChecklist";
import { VisibilityIcon } from "./habit-icon";

function Box({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex size-6 shrink-0 items-center justify-center rounded-sm text-on-accent ${
        done ? "bg-accent" : "border-[1.5px] border-outline-strong bg-surface"
      }`}
    >
      {done ? <Check size={16} weight="bold" /> : null}
    </span>
  );
}

/** List-style row inside a Card. Plain habit: tap to check. Photo: "Foto" chip. Items: checklist below. */
export function HabitRow({ row }: { row: TodayRow }) {
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useOptimistic(row.done);
  const hasItems = row.items.length > 0;
  const checkedCount = row.items.filter((i) => i.checked).length;

  function toggle() {
    setError(null);
    start(async () => {
      setDone(!row.done);
      const result = row.done ? await undoCheckIn(row.id) : await checkIn(row.id);
      if (!result.ok) setError(result.error);
    });
  }

  const text = (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-2">
        {/* identity color: decorative, the name carries the meaning */}
        <span aria-hidden data-habit-color={row.color} className="size-2 shrink-0 rounded-full bg-(--habit)" />
        <Link
          href={`/habitos/${row.id}`}
          className={`truncate text-body ${done ? "text-muted line-through" : "text-ink"}`}
        >
          {row.name}
        </Link>
      </span>
      <span className="flex items-center gap-1 text-small text-muted">
        <VisibilityIcon value={row.visibility} />
        {habitSubtitle(row)}
        {row.streak > 0 ? (
          <span className="ml-1 font-mono text-ink">
            {row.streak}
            <span className="font-sans text-muted">
              {row.frequency.type === "daily" ? " d" : " sem"}
            </span>
          </span>
        ) : null}
      </span>
    </span>
  );

  return (
    <div>
      <div className="flex min-h-[60px] items-center gap-4 py-2.5">
        {hasItems || row.requiresPhoto ? (
          <Box done={done} />
        ) : (
          <button
            type="button"
            onClick={toggle}
            role="checkbox"
            aria-checked={done}
            aria-label={row.name}
            className="-m-2.5 flex size-11 shrink-0 items-center justify-center"
          >
            <Box done={done} />
          </button>
        )}
        {text}
        {hasItems ? (
          <span className="font-mono text-small font-medium text-muted">
            {checkedCount} de {row.items.length}
          </span>
        ) : row.requiresPhoto && !done ? (
          <Link
            href={`/habitos/${row.id}/foto`}
            className="inline-flex h-11 items-center gap-1 rounded-full bg-accent-soft px-3 text-small font-medium text-accent"
          >
            <Camera size={16} weight="light" aria-hidden />
            Foto
          </Link>
        ) : null}
      </div>
      {hasItems ? <ItemChecklist habitId={row.id} items={row.items} /> : null}
      {error ? (
        <p role="alert" className="flex items-center gap-1 pb-2 text-small text-ink">
          <Warning size={16} weight="light" className="shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
