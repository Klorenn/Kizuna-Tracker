import type { TodayRow } from "@/domain/today";

/**
 * What a Hoy row lets the user do natively in this milestone.
 * - boolean: one tap checks; a done row offers undo
 * - items: the steps are tapped one by one
 * - unsupported: quantity, time, reading, workout... and photo habits are registered in the web screens for now
 */
export type RowAction = "boolean" | "items" | "unsupported";

export function rowAction(row: Pick<TodayRow, "logType" | "items" | "requiresPhoto" | "quantity">): RowAction {
  if (row.items.length > 0) return row.items.some((i) => i.requiresPhoto) ? "unsupported" : "items";
  if (row.logType !== "none" || row.requiresPhoto || row.quantity) return "unsupported";
  return "boolean";
}
