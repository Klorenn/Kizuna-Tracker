import { describe, expect, it } from 'vitest'
import { profileShareUrl, toPublicProfileView } from '@/lib/public-profile'

describe('public profile view', () => {
  const row = {
    username: 'pau_k',
    displayName: 'Pau Koh',
    avatarPath: null,
    photo_path: 'x/y.jpg',
    habits: [
      {
        name: 'Leer',
        icon: 'book',
        frequencyType: 'daily',
        targetPerWeek: null,
        dates: ['2026-11-21', '2026-11-22'],
        photo_path: 'a.jpg',
      },
    ],
  }

  it('builds streak and a 35-day calendar ending today, whitelisting fields', () => {
    const v = toPublicProfileView(row as never, '2026-11-23')
    expect(v.habits[0].streak).toBe(2)
    expect(v.habits[0].calendar).toHaveLength(35)
    expect(v.habits[0].calendar.at(-1)).toEqual({ date: '2026-11-23', done: false })
    expect(v.habits[0].calendar.at(-2)).toEqual({ date: '2026-11-22', done: true })
    expect(JSON.stringify(v)).not.toMatch(/photo/)
  })

  it('uses weekly streaks for weekly habits', () => {
    const v = toPublicProfileView(
      { ...row, habits: [{ ...row.habits[0], frequencyType: 'weekly', targetPerWeek: 2, dates: ['2026-11-16', '2026-11-17'] }] } as never,
      '2026-11-23',
    )
    expect(v.habits[0].streak).toBe(1)
  })

  it('builds the share url', () => {
    expect(profileShareUrl('https://kizuna.app', 'pau_k')).toBe('https://kizuna.app/@pau_k')
  })
})
