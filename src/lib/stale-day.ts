import { localDate } from "@/domain/dates";

/**
 * A queued tap records the local day (in the profile zone) on which it happened. If that day is over
 * when it is replayed, it is dropped, never credited to a later day. Pure: shared by the web quantity
 * queue and the native mutation replay.
 */
export type TapStamp = { day?: string; zone?: string };

/** True when the tap's local day is over (its zone's date is now later). Unknown day or zone: not stale. */
export function isStaleTap(tap: TapStamp, now: number): boolean {
  if (!tap.day || !tap.zone) return false;
  try {
    return localDate(new Date(now), tap.zone) > tap.day;
  } catch {
    return false;
  }
}

/** The one notice for taps dropped because their day was over at replay (singular or counted plural). */
export const staleDayNotice = (count: number): string =>
  count === 1 ? "Un registro de ayer no se guardó." : `${count} registros de ayer no se guardaron.`;
