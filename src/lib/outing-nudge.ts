import { monthStartOf } from '@/domain/outings'
import { dueMonthDay } from '@/domain/local-window'

export type OutingNudgeDeps = {
  listOwners(): Promise<{ id: string; timezone: string }[]>
  completed(userId: string, monthStart: string): Promise<number>
  claim(userId: string, localDate: string): Promise<boolean>
  insertInApp(userId: string): Promise<void>
}

const NUDGE_MINUTE = 10 * 60

/** Quien ya usa el mapa: es dueño de una salida o aceptó una. El resto no recibe el aviso. */
export function nudgeAudience(ownerIds: readonly string[], acceptedInviteeIds: readonly string[]): string[] {
  return [...new Set([...ownerIds, ...acceptedInviteeIds].filter((id) => id.length > 0))]
}

/** In-app notice on the 15th at 10:00 local when the owner's month is still at 0. No push. */
export async function runOutingMonthNudge(deps: OutingNudgeDeps, now: Date): Promise<number> {
  const owners = await deps.listOwners()
  let sent = 0
  for (const owner of owners) {
    const day = dueMonthDay(now, owner.timezone, 15, NUDGE_MINUTE)
    if (!day) continue
    const completed = await deps.completed(owner.id, monthStartOf(day))
    if (completed !== 0) continue
    const won = await deps.claim(owner.id, day)
    if (!won) continue
    await deps.insertInApp(owner.id)
    sent += 1
  }
  return sent
}
