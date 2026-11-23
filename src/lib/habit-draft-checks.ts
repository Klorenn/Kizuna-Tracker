import { LOG_TYPES } from "@/domain/logs";
import type { HabitDraft } from "@/domain/presets";

const twoDecimals = (n: number) => !Number.isFinite(n) || Math.round(n * 100) / 100 === n;

/**
 * Checks the shared draft validation does not make: the log type must be a known one, and a km or
 * custom goal or step has at most two decimals (the database rounds the rest without saying so).
 * Used by the form and, again, by the server actions.
 */
export function draftExtraError(d: HabitDraft): string | null {
  if (!(LOG_TYPES as readonly string[]).includes(d.logType)) return "Elige el tipo de registro.";
  if (d.logType === "quantity" && d.quantity && !(twoDecimals(d.quantity.target) && twoDecimals(d.quantity.step))) {
    return "Usa hasta dos decimales.";
  }
  return null;
}
