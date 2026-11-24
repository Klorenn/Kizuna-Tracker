"use client";

import { Camera, Check } from "@phosphor-icons/react";
import Link from "next/link";
import type { TodayItem } from "@/domain/today";

/**
 * Day steps (e.g. Desayuno, Almuerzo...). The habit's check-in appears when all are checked. The row
 * owns the optimistic state (it also shows the count and the habit's box), so a tap only reports it.
 */
export function ItemChecklist({
  habitId,
  items,
  onToggle,
}: {
  habitId: string;
  items: TodayItem[];
  onToggle: (item: TodayItem) => void;
}) {
  return (
    <div className="flex flex-col pb-2 pl-10">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          {item.requiresPhoto && !item.checked ? (
            <>
              <span className="flex min-h-11 flex-1 items-center gap-3 text-body text-ink">
                <span aria-hidden className="size-[22px] shrink-0 rounded-sm border-[1.5px] border-outline-strong bg-surface" />
                {item.label}
              </span>
              <Link
                href={`/habitos/${habitId}/foto?paso=${item.id}`}
                className="inline-flex h-11 items-center gap-1 rounded-full bg-accent-soft px-3 text-small font-medium text-accent"
              >
                <Camera size={16} weight="light" aria-hidden />
                Foto
              </Link>
            </>
          ) : (
            <>
              <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={item.checked}
                  onChange={() => onToggle(item)}
                />
                <span className="flex size-[22px] shrink-0 items-center justify-center rounded-sm border-[1.5px] border-outline-strong bg-surface text-on-accent peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100">
                  <Check size={16} weight="bold" aria-hidden />
                </span>
                <span className={`text-body ${item.checked ? "text-muted line-through" : "text-ink"}`}>
                  {item.label}
                </span>
              </label>
              <span
                className={`font-mono text-[15px] font-medium ${
                  item.checked ? "text-muted" : "text-outline-strong"
                }`}
              >
                {item.checked ? item.time : "—"}
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
