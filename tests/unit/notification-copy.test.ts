import { describe, expect, it } from 'vitest'
import { notificationView } from '@/lib/notification-copy'

describe('notificationView', () => {
  it('new_debt is neutral: no amount on the lock screen', () => {
    const v = notificationView('new_debt', { amount: 4500 })
    expect(v.title).toBe('Tienes una nueva multa registrada')
    expect(JSON.stringify(v)).not.toMatch(/\d/)
    expect(v.url).toBe('/deudas')
  })
})
