"use client";

import { useRouter } from "next/navigation";
import { Segmented } from "@/components/ui/Segmented";

/** Habit selector for Resumen: the choice lives in the URL (?h=<id>) so the page stays server-rendered. */
export function HabitSwitcher({ habits, value }: { habits: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  const go = (id: string) => router.replace(`/resumen?h=${id}`, { scroll: false });
  if (habits.length > 3) {
    return (
      <select
        aria-label="Hábito"
        value={value}
        onChange={(e) => go(e.target.value)}
        className="h-11 w-full rounded-md border border-outline-strong bg-paper px-3 text-body text-ink"
      >
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
      options={habits.map((h) => ({ value: h.id, label: h.name }))}
      value={value}
      onChange={go}
    />
  );
}
