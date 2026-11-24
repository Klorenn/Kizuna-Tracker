import type { TodayRow } from "@/domain/today";

/**
 * What a Hoy row lets the user do natively.
 * - boolean: one tap checks; a done row offers undo
 * - items: the steps are tapped one by one
 * - quantity: quick add of one step, and the quantity screen
 * - time: the time screen (and the Pomodoro)
 * - reading, workout, cardio, watch: each has its own screen (pick, type, save)
 * - unsupported: photo habits are registered in the web screens until the photo flow lands
 */
export type LogAction = "reading" | "workout" | "cardio" | "watch";
export type RowAction = "boolean" | "items" | "quantity" | "time" | LogAction | "unsupported";

/** The screen title of each log action (the button label on Hoy and the habit detail). */
export const LOG_ACTION_LABEL: Record<LogAction, { button: string }> = {
  reading: { button: "Registrar lectura" },
  workout: { button: "Registrar entrenamiento" },
  cardio: { button: "Registrar salida" },
  watch: { button: "Registrar lo que viste" },
};

export const isLogAction = (a: RowAction): a is LogAction => a === "reading" || a === "workout" || a === "cardio" || a === "watch";

export function rowAction(row: Pick<TodayRow, "logType" | "items" | "requiresPhoto" | "quantity">): RowAction {
  if (row.items.length > 0) return row.items.some((i) => i.requiresPhoto) ? "unsupported" : "items";
  if (row.requiresPhoto) return "unsupported";
  if (row.quantity) return "quantity";
  if (row.logType === "time") return "time";
  if (row.logType === "reading" || row.logType === "workout" || row.logType === "cardio" || row.logType === "watch") return row.logType;
  if (row.logType !== "none") return "unsupported";
  return "boolean";
}
