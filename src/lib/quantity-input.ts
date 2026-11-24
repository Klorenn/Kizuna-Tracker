/**
 * Parsing of a typed quantity (es-CL conventions). Pure: shared by the web controls and the native app.
 */
import { parseAmount, type QuantityConfig } from "@/domain/quantity";

const allowsDecimals = (c: QuantityConfig) => c.unit === "km" || c.unit === "custom" || c.display === "glasses";

export const TYPED_AMOUNT_COPY = {
  invalid: "Revisa la cantidad.",
  whole: "Usa números enteros, por ejemplo 1250.",
  ambiguous: "¿Mil o decimal? Escribe 1250 o 1,25.",
} as const;

export type TypedAmount = { ok: true; amount: number } | { ok: false; error: string };

const THOUSANDS = /^[1-9]\d{0,2}(\.\d{3})+$/;

/**
 * What the user typed, in base units, with es-CL conventions. A number never silently changes by a
 * factor of 1000:
 * - A comma is the decimal separator. Dots before it are thousands and must form groups of three
 *   ("1.250,5" = 1250,5; "12.50,5" is refused). Extra decimal zeros are dropped ("1,250" = 1,25).
 * - Whole-number units (ml, steps, times, minutes): digits with valid thousands dots ("1.250" = 1250);
 *   any fractional part is refused ("1.5", "1,250").
 * - Decimal units (km, custom, glasses): one dot and one or two digits is a decimal point ("1.5");
 *   one dot and exactly three digits is ambiguous and refused ("10.000"); several dots are refused.
 */
export function parseTypedAmountResult(raw: string, c: QuantityConfig): TypedAmount {
  const invalid: TypedAmount = { ok: false, error: TYPED_AMOUNT_COPY.invalid };
  const s = raw.trim();
  if (!/^[\d.,]+$/.test(s)) return invalid;
  const decimals = allowsDecimals(c);
  let normalized: string;

  if (s.includes(",")) {
    const parts = s.split(",");
    if (parts.length !== 2) return invalid;
    const [intRaw, fracRaw] = parts;
    if (!/^\d+$/.test(intRaw) && !THOUSANDS.test(intRaw)) return invalid;
    if (!/^\d+$/.test(fracRaw)) return invalid;
    if (!decimals) return { ok: false, error: TYPED_AMOUNT_COPY.whole };
    const frac = fracRaw.replace(/0+$/, "");
    if (frac.length > 2) return invalid;
    normalized = `${intRaw.replace(/\./g, "")}${frac ? `.${frac}` : ""}`;
  } else if (!s.includes(".")) {
    normalized = s;
  } else if (!decimals) {
    if (THOUSANDS.test(s)) normalized = s.replace(/\./g, "");
    else if (/^\d+\.\d+$/.test(s)) return { ok: false, error: TYPED_AMOUNT_COPY.whole };
    else return invalid;
  } else {
    const m = /^(\d+)\.(\d+)$/.exec(s);
    if (!m) return invalid;
    if (m[2].length === 3) return { ok: false, error: TYPED_AMOUNT_COPY.ambiguous };
    if (m[2].length > 3) return invalid;
    normalized = s;
  }

  const amount = parseAmount(normalized, c);
  return amount === null ? invalid : { ok: true, amount };
}

/** The number-or-null view of `parseTypedAmountResult`. */
export function parseTypedAmount(raw: string, c: QuantityConfig): number | null {
  const r = parseTypedAmountResult(raw, c);
  return r.ok ? r.amount : null;
}
