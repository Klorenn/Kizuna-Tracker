import { addDays } from "@/domain/dates";
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
    streak: number;
    calendar: { date: LocalDate; done: boolean }[];
  }[];
};

const CALENDAR_DAYS = 35;

/** Explicit whitelist: nothing else from the row (photos included) can reach the view. */
export function toPublicProfileView(row: PublicProfileRow, today: LocalDate): PublicProfileView {
  return {
    username: row.username,
    displayName: row.displayName,
    avatarPath: row.avatarPath ?? null,
    habits: row.habits.map((h) => {
      const done = new Set(h.dates);
      return {
        name: h.name,
        icon: h.icon,
        frequencyType: h.frequencyType,
        targetPerWeek: h.targetPerWeek,
        streak:
          h.frequencyType === "weekly"
            ? weeklyStreak(h.dates, h.targetPerWeek ?? 1, today)
            : dailyStreak(h.dates, today),
        calendar: Array.from({ length: CALENDAR_DAYS }, (_, i) => {
          const date = addDays(today, i - (CALENDAR_DAYS - 1));
          return { date, done: done.has(date) };
        }),
      };
    }),
  };
}

export function profileShareUrl(origin: string, username: string): string {
  return `${origin}/@${username}`;
}
