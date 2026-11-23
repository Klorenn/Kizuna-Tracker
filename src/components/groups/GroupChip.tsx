/**
 * GroupChip: the small chip of the Hoy row for a habit linked to a group.
 *
 * Props: `name` (the group's name), `color` (a habit colour key; anything else renders as the
 * default). One line, truncated; the accessible name is "Grupo <nombre>". Server-safe (no hooks).
 */
import { toHabitColor } from "@/domain/habit-colors";

export function GroupChip({ name, color }: { name: string; color: string }) {
  return (
    <span
      data-habit-color={toHabitColor(color)}
      aria-label={`Grupo ${name}`}
      className="inline-flex h-5 min-w-0 max-w-40 shrink items-center gap-1 rounded-full bg-(--habit-soft) px-2 text-small font-medium text-ink"
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-(--habit)" />
      <span className="truncate">{name}</span>
    </span>
  );
}
