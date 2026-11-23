"use client";

/**
 * BoardList: the current week of a group, one row per member.
 *
 * Props: `rows` (GroupBoardRow[] | null: null = the read failed), `myUserId` (marks the caller's row
 * "Tú"), `color` (the group's habit colour key, for the progress segments), `retryHref`.
 * States: failed (LoadFailed), rows (ordered by progress then name), a row that does not count yet
 * ("Empieza el lunes"). Of each member it shows name, @usuario, avatar, the week's count and the
 * "Cumplió" chip; nothing else, whatever the row carries.
 */
import { Check } from "@phosphor-icons/react";
import { memo, useMemo } from "react";
import { LoadFailed } from "@/components/LoadFailed";
import { Card } from "@/components/ui/Card";
import { toHabitColor } from "@/domain/habit-colors";
import type { GroupBoardRow } from "@/lib/groups-contract";
import { isComplied, sortBoard } from "./group-logic";
import { Mono, PersonLink } from "./parts";

/** Progress in the group colour, one segment per time of the target (at most 7); empty ones stay neutral. */
function Segments({ done, target }: { done: number; target: number }) {
  return (
    <div aria-hidden className="flex gap-1">
      {Array.from({ length: target }, (_, i) => (
        <span key={i} className={`h-1.5 flex-1 rounded-full ${i < done ? "bg-(--habit)" : "bg-ink-soft"}`} />
      ))}
    </div>
  );
}

/** Memoized by value: a change to one member does not re-render the other 49 rows. */
export const BoardRow = memo(function BoardRow({ row, you }: { row: GroupBoardRow; you: boolean }) {
  const complied = isComplied(row);
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <PersonLink person={row} you={you} />
        <div className="flex w-28 shrink-0 flex-col items-end gap-1 text-right">
          {row.counts ? (
            <>
              <span className="text-small text-ink">
                <Mono>{Math.min(row.done, 99)}</Mono> de <Mono>{row.target}</Mono>
              </span>
              <span className="flex h-6 items-center">
                {complied ? (
                  <span className="inline-flex h-6 items-center gap-1 rounded-full bg-(--habit-soft) px-2 text-small font-medium text-ink">
                    <Check size={14} weight="light" aria-hidden />
                    Cumplió
                  </span>
                ) : null}
              </span>
            </>
          ) : (
            <span className="text-small text-muted">Empieza el lunes</span>
          )}
        </div>
      </div>
      {row.counts ? <Segments done={Math.min(row.done, row.target)} target={row.target} /> : null}
    </li>
  );
});

export function BoardList({
  rows,
  myUserId,
  color,
  retryHref,
}: {
  rows: GroupBoardRow[] | null;
  myUserId: string;
  color: string;
  retryHref: string;
}) {
  const sorted = useMemo(() => (rows ? sortBoard(rows) : []), [rows]);
  if (!rows) return <LoadFailed href={retryHref} />;
  return (
    <Card data-habit-color={toHabitColor(color)}>
      <ul className="divide-y divide-line">
        {sorted.map((r) => (
          <BoardRow key={r.userId} row={r} you={r.userId === myUserId} />
        ))}
      </ul>
    </Card>
  );
}
