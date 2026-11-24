import type { TodayRow } from "@/domain/today";

/**
 * What a Hoy row lets the user do natively.
 * - boolean: one tap checks; a done row offers undo
 * - items: the steps are tapped one by one
 * - quantity: quick add of one step, and the quantity screen
 * - time: the time screen (and the Pomodoro)
 * - reading, workout, cardio, watch: each has its own screen (pick, type, save)
 * - photo: the habit needs a proof photo; the camera screen makes the check-in (until then no other action)
 * - unsupported: a quantity habit that needs a photo, or steps on a habit that needs a photo (the server refuses both)
 */
export type LogAction = "reading" | "workout" | "cardio" | "watch";
export type RowAction = "boolean" | "items" | "quantity" | "time" | LogAction | "photo" | "unsupported";

/** The screen title of each log action (the button label on Hoy and the habit detail). */
export const LOG_ACTION_LABEL: Record<LogAction, { button: string }> = {
  reading: { button: "Registrar lectura" },
  workout: { button: "Registrar entrenamiento" },
  cardio: { button: "Registrar salida" },
  watch: { button: "Registrar lo que viste" },
};

export const isLogAction = (a: RowAction): a is LogAction => a === "reading" || a === "workout" || a === "cardio" || a === "watch";

export function rowAction(row: Pick<TodayRow, "logType" | "items" | "requiresPhoto" | "quantity" | "done">): RowAction {
  if (row.items.length > 0) return row.requiresPhoto ? "unsupported" : "items";
  if (row.requiresPhoto) {
    if (row.quantity || row.logType === "quantity") return "unsupported";
    // the photo makes the check-in; afterwards the habit goes back to its own action
    if (!row.done) return "photo";
  }
  if (row.quantity) return "quantity";
  if (row.logType === "time") return "time";
  if (row.logType === "reading" || row.logType === "workout" || row.logType === "cardio" || row.logType === "watch") return row.logType;
  if (row.logType !== "none") return "unsupported";
  return "boolean";
}
