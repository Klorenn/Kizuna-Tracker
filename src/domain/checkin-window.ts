import { TZDate } from "@date-fns/tz";
import { addDays, localDate } from "./dates";
import type { LocalDate } from "./types";

/** Yesterday stays open until this hour, local. 12 means noon: 11:59 is open, 12:00 is closed. */
export const YESTERDAY_GRACE_END_HOUR = 12;

export function localHour(instant: Date, tz: string): number {
  return new TZDate(instant, tz).getHours();
}

/** Today is always markable. Yesterday is markable before noon local. Nothing older. */
export function checkinDateAllowed(now: Date, tz: string, date: LocalDate): boolean {
  const today = localDate(now, tz);
  if (date === today) return true;
  if (date !== addDays(today, -1)) return false;
  return localHour(now, tz) < YESTERDAY_GRACE_END_HOUR;
}
