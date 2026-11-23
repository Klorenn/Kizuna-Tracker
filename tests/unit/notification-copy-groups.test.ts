import { describe, expect, it } from 'vitest'
import { notificationView } from '@/lib/notification-copy'

const G = '11111111-1111-4111-8111-111111111111'

describe('notificationView: group_week_closed', () => {
  const base = { group_id: G, group_name: 'Gym', week_start: '2026-11-16', members_complied: 6, members_counted: 10 }

  it('tells a member who complied', () => {
    expect(notificationView('group_week_closed', { ...base, complied: true })).toEqual({
      title: 'Gym: cerró la semana',
      body: 'Cumpliste. Cumplieron 6 de 10.',
      url: `/grupos/${G}`,
    })
  })

  it('tells a member who did not', () => {
    expect(notificationView('group_week_closed', { ...base, complied: false })).toEqual({
      title: 'Gym: cerró la semana',
      body: 'Esta vez no llegaste. Cumplieron 6 de 10.',
      url: `/grupos/${G}`,
    })
  })

  it('degrades without counts or name', () => {
    expect(notificationView('group_week_closed', { group_id: G, complied: true })).toEqual({
      title: 'Cerró la semana de tu grupo',
      body: 'Cumpliste.',
      url: `/grupos/${G}`,
    })
  })

  it('a missing or odd group id goes to the list, never into a path', () => {
    expect(notificationView('group_week_closed', {}).url).toBe('/grupos')
    expect(notificationView('group_week_closed', { group_id: '../../x' }).url).toBe('/grupos')
    expect(notificationView('group_week_closed', { group_id: 5 }).url).toBe('/grupos')
  })
})

describe('notificationView: group_member_joined', () => {
  it('names the person and the group', () => {
    expect(notificationView('group_member_joined', { group_id: G, group_name: 'Gym', user_id: 'u', display_name: 'Ana' })).toEqual({
      title: 'Ana se unió a Gym',
      body: 'Ya es parte del grupo.',
      url: `/grupos/${G}`,
    })
  })

  it('degrades without names', () => {
    expect(notificationView('group_member_joined', { group_id: G })).toEqual({
      title: 'Alguien se unió a tu grupo',
      body: 'Ya es parte del grupo.',
      url: `/grupos/${G}`,
    })
    expect(notificationView('group_member_joined', { group_id: G, display_name: 'Ana' }).title).toBe('Ana se unió a tu grupo')
  })

  it('never uses the forbidden words', () => {
    const all = JSON.stringify([
      notificationView('group_member_joined', { group_name: 'Gym', display_name: 'Ana' }),
      notificationView('group_week_closed', { group_name: 'Gym', complied: false, members_complied: 1, members_counted: 2 }),
    ])
    expect(all).not.toMatch(/apuesta|\bbet\b|pozo/i)
  })
})
