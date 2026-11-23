"use client";

import { useRouter } from "next/navigation";
import { Segmented } from "@/components/ui/Segmented";
import type { HabitColor } from "@/domain/habit-colors";

type Habit = { id: string; name: string; color: HabitColor };

const dot = (color: HabitColor) => (
  <span aria-hidden data-habit-color={color} className="size-2 shrink-0 rounded-full bg-(--habit)" />
);

/**
 * Habit selector for Resumen: the choice lives in the URL (?h=<id>) so the page stays server-rendered.
 * With two or more habits it starts with `allValue` (every habit at once).
 */
export function HabitSwitcher({ habits, value, allValue }: { habits: Habit[]; value: string; allValue: string }) {
  const router = useRouter();
  const go = (id: string) => router.replace(`/resumen?h=${id}`, { scroll: false });
  const withAll = habits.length > 1;
  if (habits.length > 2) {
    return (
      <select
        aria-label="Hábito"
        value={value}
        onChange={(e) => go(e.target.value)}
        className="h-11 w-full rounded-md border border-outline-strong bg-paper px-3 text-body text-ink"
      >
        {withAll ? <option value={allValue}>Todos los hábitos</option> : null}
        {habits.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </select>
    );
  }
  return (
    <Segmented
      label="Hábito"
      options={[
        ...(withAll ? [{ value: allValue, label: "Todos" }] : []),
        ...habits.map((h) => ({ value: h.id, label: h.name, leading: dot(h.color) })),
      ]}
      value={value}
      onChange={go}
    />
  );
}
