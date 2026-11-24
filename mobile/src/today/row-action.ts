import type { TodayRow } from "@/domain/today";

/**
 * What a Hoy row lets the user do natively.
 * - boolean: one tap checks; a done row offers undo
 * - items: the steps are tapped one by one
 * - quantity: quick add of one step, and the quantity screen
 * - time: the time screen (and the Pomodoro)
 * - unsupported: reading, workout... and photo habits are registered in the web screens for now
 */
export type RowAction = "boolean" | "items" | "quantity" | "time" | "unsupported";

export function rowAction(row: Pick<TodayRow, "logType" | "items" | "requiresPhoto" | "quantity">): RowAction {
  if (row.items.length > 0) return row.items.some((i) => i.requiresPhoto) ? "unsupported" : "items";
  if (row.requiresPhoto) return "unsupported";
  if (row.quantity) return "quantity";
  if (row.logType === "time") return "time";
  if (row.logType !== "none") return "unsupported";
  return "boolean";
}
