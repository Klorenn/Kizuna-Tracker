import 'server-only'
import { dueUsersForSlot, STREAK_RISK_SLOT, WEEKLY_SUMMARY_SLOT, type LocalSlot } from '@/domain/local-window'
import { streakAtRisk } from '@/domain/streak-risk'
import { weeklySummary, type SummaryDebt } from '@/domain/weekly-summary'
import { notify } from '@/lib/notify'
import { claimNotifications } from '@/lib/notification-log-repo'
import { loadNotificationTargets, type NotificationTarget, type ScheduledKind } from '@/lib/notification-targets-repo'
import { loadUserDebts, loadUserHabits, type UserHabit } from '@/lib/scheduled-data-repo'
import type { NotificationType } from '@/lib/notification-copy'
import type { createAdminClient } from '@/lib/supabase/admin'

export type { UserHabit }

export type ScheduledDeps = {
  loadTargets(kind: ScheduledKind): Promise<NotificationTarget[]>
  loadHabits(userIds: string[], scope: 'streak-risk' | 'summary'): Promise<Map<string, UserHabit[]>>
  loadDebts(userIds: string[], now: Date): Promise<Map<string, SummaryDebt[]>>
  claim(kind: ScheduledKind, entries: { id: string; localDate: string }[]): Promise<string[]>
  notify(userId: string, type: NotificationType, payload: Record<string, unknown>, opts?: { defer?: boolean }): Promise<void>
}

export function scheduledDeps(db: ReturnType<typeof createAdminClient>): ScheduledDeps {
  return {
    loadTargets: (kind) => loadNotificationTargets(db, kind),
    loadHabits: (ids, scope) => loadUserHabits(db, ids, scope),
    loadDebts: (ids, now) => loadUserDebts(db, ids, now),
    claim: (kind, entries) => claimNotifications(db, kind, entries),
    notify,
  }
}

const SEND_BATCH = 10

/** Shared shape: due users -> payload per user -> claim the day -> notify the winners. */
async function run(
  deps: ScheduledDeps,
  now: Date,
  kind: ScheduledKind,
  slot: LocalSlot,
  buildPayloads: (due: { id: string; timezone: string; localDate: string }[]) => Promise<Map<string, Record<string, unknown>>>,
): Promise<number> {
  const due = dueUsersForSlot(await deps.loadTargets(kind), now, slot)
  if (due.length === 0) return 0
  const payloads = await buildPayloads(due)
  const entries = due.filter((u) => payloads.has(u.id)).map((u) => ({ id: u.id, localDate: u.localDate }))
  const won = entries.length === 0 ? [] : await deps.claim(kind, entries) // once per user per local date
  console.info('scheduled push', { kind, due: due.length, candidates: entries.length, won: won.length })
  for (let i = 0; i < won.length; i += SEND_BATCH) {
    await Promise.all(won.slice(i, i + SEND_BATCH).map((id) => deps.notify(id, kind, payloads.get(id) ?? {}, { defer: true })))
  }
  return won.length
}

/** 20:00 local: one push per user per day naming the biggest streak about to break. */
export function runStreakRisk(deps: ScheduledDeps, now: Date): Promise<number> {
  return run(deps, now, 'streak_risk', STREAK_RISK_SLOT, async (due) => {
    const habits = await deps.loadHabits(due.map((u) => u.id), 'streak-risk')
    const out = new Map<string, Record<string, unknown>>()
    for (const u of due) {
      const risk = streakAtRisk(habits.get(u.id) ?? [], u.localDate)
      if (risk) out.set(u.id, { habit_name: risk.habitName, streak: risk.streak, more: risk.more })
    }
    return out
  })
}

/** Sunday 21:00 local: one push per user with the summary of the ISO week that is ending. */
export function runWeeklySummary(deps: ScheduledDeps, now: Date): Promise<number> {
  return run(deps, now, 'weekly_summary', WEEKLY_SUMMARY_SLOT, async (due) => {
    const ids = due.map((u) => u.id)
    const [habits, debts] = await Promise.all([deps.loadHabits(ids, 'summary'), deps.loadDebts(ids, now)])
    const out = new Map<string, Record<string, unknown>>()
    for (const u of due) {
      const s = weeklySummary({ habits: habits.get(u.id) ?? [], debts: debts.get(u.id) ?? [], me: u.id, today: u.localDate, timeZone: u.timezone })
      if (s) {
        out.set(u.id, {
          done: s.done,
          due: s.due,
          best_streak: s.bestStreak,
          best_habit: s.bestHabit,
          won: s.won,
          lost: s.lost,
          balance: s.balance,
        })
      }
    }
    return out
  })
}

/** Both scheduled pushes; one failing never stops the other. */
export async function runScheduledNotifications(db: ReturnType<typeof createAdminClient>, now: Date): Promise<{ streakRisk: number; weeklySummary: number }> {
  const deps = scheduledDeps(db)
  const safe = (name: string, job: Promise<number>) =>
    job.catch((e) => {
      console.error(`${name} failed`, e)
      return 0
    })
  return {
    streakRisk: await safe('streak risk', runStreakRisk(deps, now)),
    weeklySummary: await safe('weekly summary', runWeeklySummary(deps, now)),
  }
}
