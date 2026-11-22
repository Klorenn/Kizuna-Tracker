import { addDays, weekStart } from "@/domain/dates";
import { toHabitColor, type HabitColor } from "@/domain/habit-colors";
import { dailyStreak, weeklyStreak } from "@/domain/streaks";
import type { LocalDate } from "@/domain/types";

/** JSON returned by the `public_profile` RPC (already whitelisted server-side). */
export type PublicProfileRow = {
  username: string;
  displayName: string;
  avatarPath: string | null;
  habits: {
    name: string;
    icon: string;
    frequencyType: "daily" | "weekly";
    targetPerWeek: number | null;
    /** Palette key (0012_habit_colors); older rows may lack it. */
    color?: string;
    dates: LocalDate[];
  }[];
};

export type PublicProfileView = {
  username: string;
  displayName: string;
  avatarPath: string | null;
  habits: {
    name: string;
    icon: string;
    frequencyType: "daily" | "weekly";
    targetPerWeek: number | null;
    color: HabitColor;
    streak: number;
    /** 26 columns (weeks, Monday to Sunday), oldest first; days after today are `future`. */
    weeks: { date: LocalDate; done: boolean; future: boolean }[][];
    /** Month label (mono, short) on the first column that starts a month; else null. */
    monthLabels: (string | null)[];
  }[];
};

export const HEATMAP_WEEKS = 26;
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Explicit whitelist: nothing else from the row (photos included) can reach the view. */
export function toPublicProfileView(row: PublicProfileRow, today: LocalDate): PublicProfileView {
  return {
    username: row.username,
    displayName: row.displayName,
    avatarPath: row.avatarPath ?? null,
    habits: row.habits.map((h) => {
      const done = new Set(h.dates);
      const first = addDays(weekStart(today), -7 * (HEATMAP_WEEKS - 1));
      const weeks = Array.from({ length: HEATMAP_WEEKS }, (_, w) =>
        Array.from({ length: 7 }, (_, d) => {
          const date = addDays(first, w * 7 + d);
          return { date, done: done.has(date), future: date > today };
        }),
      );
      let lastMonth = -1;
      const monthLabels = weeks.map((col) => {
        // label the column holding the 1st of a month, or the very first column
        const startsMonth = col.find((c) => c.date.endsWith("-01"));
        const m = Number((startsMonth ?? col[0]).date.slice(5, 7)) - 1;
        const label = (startsMonth || lastMonth === -1) && m !== lastMonth ? MONTHS[m] : null;
        if (label) lastMonth = m;
        return label;
      });
      // adjacent labels would overlap: keep the later one
      if (monthLabels[1]) monthLabels[0] = null;
      return {
        name: h.name,
        icon: h.icon,
        frequencyType: h.frequencyType,
        targetPerWeek: h.targetPerWeek,
        color: toHabitColor(h.color),
        streak:
          h.frequencyType === "weekly"
            ? weeklyStreak(h.dates, h.targetPerWeek ?? 1, today)
            : dailyStreak(h.dates, today),
        weeks,
        monthLabels,
      };
    }),
  };
}

export function profileShareUrl(origin: string, username: string): string {
  return `${origin}/@${username}`;
}
