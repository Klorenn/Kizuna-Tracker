import { describe, expect, test, vi } from 'vitest'
import { notificationView } from '@/lib/notification-copy'
import { nudgeAudience, runOutingMonthNudge, type OutingNudgeDeps } from '@/lib/outing-nudge'

const NOW = new Date('2026-11-15T13:05:00Z') // 15 nov 10:05 in Santiago

function deps(over: Partial<OutingNudgeDeps> = {}): OutingNudgeDeps & { notify: ReturnType<typeof vi.fn> } {
  const notify = vi.fn()
  return {
    listOwners: async () => [{ id: 'ana', timezone: 'America/Santiago' }],
    completed: async () => 0,
    claim: async () => true,
    insertInApp: vi.fn(async () => {}),
    notify,
    ...over,
  }
}

describe('a quién le toca el aviso', () => {
  test('solo dueños y quien aceptó una salida', () => {
    expect(nudgeAudience(['ana', ''], ['ana', 'leo'])).toEqual(['ana', 'leo'])
    expect(nudgeAudience([], [])).toEqual([])
  })
})

describe('aviso del día 15', () => {
  test('el texto no nombra lugares ni el piso', () => {
    expect(notificationView('outing_month_nudge', {})).toEqual({
      title: 'Este mes todavía no tiene una salida.',
      body: 'Cuando marques una, el mes queda cumplido.',
      url: '/mapa',
    })
  })

  test('el 15 a las 10:05 con el mes en 0 inserta un aviso y no llama a notify', async () => {
    const d = deps()
    expect(await runOutingMonthNudge(d, NOW)).toBe(1)
    expect(d.insertInApp).toHaveBeenCalledWith('ana')
    expect(d.notify).not.toHaveBeenCalled()
  })

  test('un mes con 2 no inserta', async () => {
    const d = deps({ completed: async () => 2 })
    expect(await runOutingMonthNudge(d, NOW)).toBe(0)
    expect(d.insertInApp).not.toHaveBeenCalled()
  })

  test('si el reclamo ya se ganó, no inserta otro', async () => {
    const d = deps({ claim: async () => false })
    expect(await runOutingMonthNudge(d, NOW)).toBe(0)
    expect(d.insertInApp).not.toHaveBeenCalled()
  })

  test('el día 16 no inserta', async () => {
    const d = deps()
    expect(await runOutingMonthNudge(d, new Date('2026-11-16T13:05:00Z'))).toBe(0)
    expect(d.insertInApp).not.toHaveBeenCalled()
  })
})
