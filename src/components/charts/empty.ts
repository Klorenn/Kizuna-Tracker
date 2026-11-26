export const EMPTY_CHART = "Todavía no hay check-ins. Cuando marques, vas a ver cómo avanza.";

export function hasChartValues(values: readonly number[]): boolean {
  return values.some((n) => n > 0);
}
