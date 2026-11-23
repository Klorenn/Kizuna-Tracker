import type { TodayRow } from "@/domain/today";
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
    a.logsKnown === b.logsKnown &&
    JSON.stringify(a.row) === JSON.stringify(b.row) &&
    JSON.stringify(a.reading) === JSON.stringify(b.reading) &&
    JSON.stringify(a.group) === JSON.stringify(b.group)
  );
}

/**
 * "Añadir registro" on a done habit that has a log type and no log. Never when the log state is
 * unknown: "no log" would be a guess, and the add sheet would overwrite an entry that exists.
 */
export function addLogOffered(row: TodayRow, logsKnown: boolean): boolean {
  return logsKnown && row.done && row.log === null && row.logType !== "none" && row.logType !== "quantity";
}
