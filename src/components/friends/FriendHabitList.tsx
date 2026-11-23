import type { FriendHabit } from "@/lib/friend-profile-data";
import { streakText } from "@/lib/profile-view";

/** 7-day dot sparkline in the habit's identity color (soft = not done). */
function WeekDots({ week }: { week: FriendHabit["week"] }) {
  const done = week.filter((d) => d.done).length;
  return (
    <span role="img" aria-label={`${done} de los últimos 7 días`} className="flex shrink-0 items-center gap-[3px]">
      {week.map((d) => (
        <span key={d.date} className={`size-2 rounded-full ${d.done ? "bg-(--habit)" : "bg-(--habit-soft)"}`} />
      ))}
    </span>
  );
}

/** "Sus hábitos" on a friend's profile: read-only rows (their habit pages are not yours to open). */
export function FriendHabitList({ habits }: { habits: FriendHabit[] }) {
  return (
    <ul className="divide-y divide-line">
      {habits.map((h) => (
        <li key={h.id} data-habit-color={h.color} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-(--habit)" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-body text-ink">{h.name}</span>
            <span className="text-small text-muted">
              {h.streak.value > 0 ? (
                <>
                  <span className="font-mono font-medium text-ink">{h.streak.value}</span>{" "}
                  {streakText(h.streak.value, h.streak.unit)} de racha
                </>
              ) : (
                "Sin racha activa"
              )}
            </span>
          </span>
          <WeekDots week={h.week} />
        </li>
      ))}
    </ul>
  );
}
