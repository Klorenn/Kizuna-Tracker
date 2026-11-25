/**
 * The Hoy group chips from the raw rows of the `my_groups` RPC, with no server-only code so the native app can use it
 * (`groups-data.ts` maps the same rows for the web, but it is server-only). Only what a chip needs is read, defensively:
 * a row that is not shaped like a live, linked group is skipped, never thrown on.
 */
export type GroupChip = { name: string; color: string };

export function chipsFromMyGroupsRows(rows: unknown): Map<string, GroupChip> {
  const chips = new Map<string, GroupChip>();
  if (!Array.isArray(rows)) return chips;
  for (const r of rows) {
    if (typeof r !== "object" || r === null) continue;
    const o = r as Record<string, unknown>;
    if (o.archived === true) continue;
    if (typeof o.my_habit_id !== "string" || typeof o.name !== "string" || typeof o.color !== "string") continue;
    chips.set(o.my_habit_id, { name: o.name, color: o.color });
  }
  return chips;
}
