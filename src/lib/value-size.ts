/**
 * Type size (Tailwind class) for a big mono number so it always fits its column and is never
 * cut with an ellipsis: 28 px up to six characters, then a smaller step, and a wrapping
 * fallback beyond that. Sized for the narrowest tile (~120 px of text at 360 px wide).
 */
export function valueSizeClass(value: string): string {
  const n = value.length;
  if (n <= 6) return "text-[28px]";
  if (n <= 8) return "text-[24px]";
  if (n <= 10) return "text-[20px]";
  return "text-[17px]";
}

/** Shared look of a big value: mono, never truncated (it may wrap on a very long one). */
export const VALUE_BASE = "break-words font-mono font-semibold leading-tight tracking-[-0.02em] text-ink";
