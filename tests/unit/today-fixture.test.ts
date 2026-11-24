import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { describe, expect, it } from 'vitest'
import { buildToday } from '@/domain/today'
import fixture from '../fixtures/today-fixture.json'

/**
 * The web's Hoy output for the shared fixture. mobile/src/data/today.test.ts feeds the same file through the native
 * view-model and expects the same `expected`, so web and native cannot drift apart (native-tracking R1).
 */
describe('today fixture (web side)', () => {
  const { raw, expected, nowIso } = fixture
  const view = buildToday({
    habits: raw.habits,
    items: raw.items,
    checkins: raw.checkins,
    itemChecks: raw.itemChecks,
    logs: raw.todayLogs.logs,
    quantity: raw.todayLogs.quantity,
    today: raw.today,
    timeZone: raw.timeZone,
  })

  it('matches the hand-computed expectation (rows, streaks, week counts, items)', () => {
    expect(
      view.rows.map((r) => ({
        id: r.id,
        name: r.name,
        done: r.done,
        streak: r.streak,
        weekCount: r.weekCount,
        items: r.items.map((i) => ({ id: i.id, label: i.label, checked: i.checked, time: i.time })),
      })),
    ).toEqual(expected.rows)
    expect(view.doneCount).toBe(expected.doneCount)
    expect(view.total).toBe(expected.total)
    expect(view.bestDailyStreak).toBe(expected.bestDailyStreak)
  })

  it('the Hoy label is the web format', () => {
    expect(`Hoy · ${format(new TZDate(new Date(nowIso), raw.timeZone), 'EEE d MMM', { locale: es })}`).toBe(expected.label)
  })
})
