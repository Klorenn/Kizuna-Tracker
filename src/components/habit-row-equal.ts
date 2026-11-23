import type { HabitRowProps } from "./HabitRow";

/**
 * Props compare by value: Hoy re-renders with fresh (equal) objects after every refresh, so a tap
 * on one row changes only that row's data and every other row keeps what it rendered.
 */
export function habitRowPropsEqual(a: HabitRowProps, b: HabitRowProps): boolean {
  return (
    a.today === b.today &&
    a.timeZone === b.timeZone &&
    a.checkinId === b.checkinId &&
    JSON.stringify(a.row) === JSON.stringify(b.row) &&
    JSON.stringify(a.reading) === JSON.stringify(b.reading)
  );
}
