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

  it('builds streak and a 26-week Monday-first heatmap, whitelisting fields', () => {
    const v = toPublicProfileView(row as never, '2026-11-25') // Wednesday
    const h = v.habits[0]
    expect(h.streak).toBe(0)
    expect(h.weeks).toHaveLength(26)
    for (const col of h.weeks) expect(col).toHaveLength(7)
    const last = h.weeks.at(-1)!
    expect(last[0].date).toBe('2026-11-23') // Monday of today's week
    expect(last[2]).toEqual({ date: '2026-11-25', done: false, future: false })
    expect(last[3].future).toBe(true)
    expect(h.weeks[0][0].date).toBe('2026-06-01')
    expect(h.weeks.at(-2)?.[6]).toEqual({ date: '2026-11-22', done: true, future: false })
    expect(h.monthLabels).toHaveLength(26)
    expect(h.monthLabels.at(-1)).toBe(null)
    expect(h.monthLabels.filter(Boolean)).toContain('nov')
    expect(JSON.stringify(v)).not.toMatch(/photo/)
  })

  it('counts the daily streak up to today', () => {
    expect(toPublicProfileView(row as never, '2026-11-23').habits[0].streak).toBe(2)
  })

  it('uses weekly streaks for weekly habits', () => {
    const v = toPublicProfileView(
      { ...row, habits: [{ ...row.habits[0], frequencyType: 'weekly', targetPerWeek: 2, dates: ['2026-11-16', '2026-11-17'] }] } as never,
      '2026-11-23',
    )
    expect(v.habits[0].streak).toBe(1)
  })

  it('passes the habit color key through, falling back to indigo for anything unknown', () => {
    const colored = { ...row, habits: [{ ...row.habits[0], color: 'salvia' }] }
    expect(toPublicProfileView(colored as never, '2026-11-23').habits[0].color).toBe('salvia')
    const odd = { ...row, habits: [{ ...row.habits[0], color: 'url(javascript:x)' }] }
    expect(toPublicProfileView(odd as never, '2026-11-23').habits[0].color).toBe('indigo')
    expect(toPublicProfileView(row as never, '2026-11-23').habits[0].color).toBe('indigo')
  })

  it('keeps the avatar path and its version (cache-buster) for the public avatar', () => {
    const withAvatar = { ...row, avatarPath: 'u1.jpg', avatarUpdatedAt: '2026-11-20T10:00:00Z' }
    const v = toPublicProfileView(withAvatar as never, '2026-11-23')
    expect(v.avatarPath).toBe('u1.jpg')
    expect(v.avatarUpdatedAt).toBe('2026-11-20T10:00:00Z')
    expect(toPublicProfileView(row as never, '2026-11-23').avatarUpdatedAt).toBe(null)
  })

  it('keeps the avatar preset (1..8) and drops anything else', () => {
    expect(toPublicProfileView({ ...row, avatarPreset: 6 } as never, '2026-11-23').avatarPreset).toBe(6)
    expect(toPublicProfileView(row as never, '2026-11-23').avatarPreset).toBe(null)
    expect(toPublicProfileView({ ...row, avatarPreset: 42 } as never, '2026-11-23').avatarPreset).toBe(null)
  })

  it('builds the share url', () => {
    expect(profileShareUrl('https://kizuna.app', 'pau_k')).toBe('https://kizuna.app/@pau_k')
  })
})
