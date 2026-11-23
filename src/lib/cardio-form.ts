import { parseDistance, parseHms, type CardioKind } from "@/domain/cardio";

// Messages of the cardio form, so the sheet answers before any round trip. Pure, no I/O.

/** Why the three time fields are not a valid time; null when they are. */
export function cardioTimeError(h: string, m: string, s: string): string | null {
  if (parseHms(h, m, s) !== null) return null;
  if (h.trim() === "" && m.trim() === "" && s.trim() === "") return "Escribe el tiempo.";
  const over = (v: string) => /^\d{1,5}$/.test(v.trim()) && Number(v) > 59;
  if (over(m) || over(s)) return "Minutos y segundos van de 0 a 59.";
  return "El tiempo va de 1 segundo a 24 horas.";
}

/** Why the distance text is not valid for the activity; null when it is. */
export function cardioDistanceError(raw: string, kind: CardioKind): string | null {
  if (parseDistance(raw, kind) !== null) return null;
  const text = raw.trim().replace(",", ".");
  if (text === "") return "Escribe la distancia.";
  if (kind === "swim") return "Escribe los metros con números enteros.";
  // a well-formed number is only out of range; anything else is a format problem
  return /^\d+(\.\d{1,3})?$/.test(text) ? "La distancia va hasta 500 km." : "Usa hasta tres decimales, por ejemplo 5,2.";
}

/** The status line after "Repetir el último": says what was copied. */
export function repeatedMessage(last: { effort: number | null; note: string | null }): string {
  const extras = [last.effort !== null ? "esfuerzo" : null, last.note ? "nota" : null].filter(Boolean);
  return `Copiamos tu última salida${extras.length ? `, con ${extras.join(" y ")}` : ""}.`;
}
