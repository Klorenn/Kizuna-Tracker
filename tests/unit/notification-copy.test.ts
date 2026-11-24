import { describe, expect, it } from 'vitest'
import { notificationView } from '@/lib/notification-copy'

describe('notificationView', () => {
  it('new_debt is neutral: no amount on the lock screen', () => {
    const v = notificationView('new_debt', { amount: 4500 })
    expect(v.title).toBe('Tienes una nueva multa registrada')
    expect(JSON.stringify(v)).not.toMatch(/\d/)
    expect(v.url).toBe('/deudas')
  })

  it('challenge_item_proposed names the proposer and the habit, links to the challenge', () => {
    const v = notificationView('challenge_item_proposed', { challenge_id: 'c1', from_name: 'Ana', habit_name: 'Agua', target: 3 })
    expect(v.title).toBe('Ana suma un sub-reto')
    expect(v.body).toBe('Agua · 3 por semana')
    expect(v.url).toBe('/retos/c1')
  })

  it('challenge_item_proposed has safe fallbacks', () => {
    const v = notificationView('challenge_item_proposed', {})
    expect(v.title).toBe('Te proponen un sub-reto')
    expect(v.body).toBe('Revisa el reto y responde.')
    expect(v.url).toBe('/retos')
  })

  it('challenge_item_accepted and challenge_item_declined', () => {
    const a = notificationView('challenge_item_accepted', { challenge_id: 'c1', from_name: 'Beto', habit_name: 'Agua' })
    expect(a.title).toBe('Beto aceptó el sub-reto')
    expect(a.body).toBe('Agua')
    expect(a.url).toBe('/retos/c1')
    const d = notificationView('challenge_item_declined', { challenge_id: 'c1', from_name: 'Beto', habit_name: 'Agua' })
    expect(d.title).toBe('Beto rechazó el sub-reto')
    expect(d.body).toBe('Agua')
    expect(d.url).toBe('/retos/c1')
    expect(notificationView('challenge_item_accepted', {}).title).toBe('Aceptaron tu sub-reto')
    expect(notificationView('challenge_item_declined', {}).title).toBe('Rechazaron tu sub-reto')
  })
})
