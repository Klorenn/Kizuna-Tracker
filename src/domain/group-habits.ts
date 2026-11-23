import type { GroupSummary } from '@/lib/groups-contract'

/** The habits the person has linked to a live group (an archived group no longer holds its habit). */
export function linkedHabitIds(groups: readonly GroupSummary[]): Set<string> {
  const ids = new Set<string>()
  for (const g of groups) if (!g.archived && g.myHabitId !== null) ids.add(g.myHabitId)
  return ids
}

/** Habit id to the group it belongs to, for the chip on the Hoy row. Live groups only. */
export function groupChipsByHabit(groups: readonly GroupSummary[]): Map<string, { name: string; color: string }> {
  const chips = new Map<string, { name: string; color: string }>()
  for (const g of groups) if (!g.archived && g.myHabitId !== null) chips.set(g.myHabitId, { name: g.name, color: g.color })
  return chips
}

export type GroupHabitCandidate = {
  id: string
  name: string
  visibility: string
  requires_photo: boolean
  log_type: string
  archived_at: string | null
}

/**
 * The habits that can go into a group: the database's rule, minus "owned by the caller" (the read
 * is already the caller's own). Not archived, not private, not a quantity habit, photo proof when
 * the group asks for it, and not already linked to another live group.
 */
export function eligibleGroupHabits(
  habits: readonly GroupHabitCandidate[],
  linked: ReadonlySet<string>,
  opts: { requiresPhoto?: boolean } = {},
): { id: string; name: string }[] {
  return habits
    .filter(
      (h) =>
        h.archived_at === null &&
        h.visibility !== 'private' &&
        h.log_type !== 'quantity' &&
        (!opts.requiresPhoto || h.requires_photo) &&
        !linked.has(h.id),
    )
    .map((h) => ({ id: h.id, name: h.name }))
}
