import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fakeSupabase } from './support/fake-supabase'

const state = { habitsError: false, profile: { timezone: 'America/Santiago' } as { timezone: string } | null, profileThrows: false }

vi.mock('@/lib/viewer', () => ({
  getSessionUser: async () => ({ id: 'u1', email: null }),
  getViewerProfile: async () => {
    if (state.profileThrows) throw new Error('viewer profile read failed: boom')
    return state.profile
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () =>
    fakeSupabase(() =>
      state.habitsError
        ? { data: null, error: { message: 'boom' } }
        : { data: [{ id: 'h1', name: 'Leer', color: 'sage', log_type: 'reading', archived_at: null }] },
    ).client,
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`)
  },
}))

import { loadLogsContext } from '@/app/(app)/resumen/logs-view'

beforeEach(() => {
  state.habitsError = false
  state.profile = { timezone: 'America/Santiago' }
  state.profileThrows = false
})

describe('loadLogsContext', () => {
  test('reads the log habits', async () => {
    const ctx = await loadLogsContext()
    expect(ctx.logHabits.map((h) => h.id)).toEqual(['h1'])
    expect(ctx.readingHabit?.id).toBe('h1')
  })

  test('a failed habits read throws (error page), not an empty list that 404s a real habit', async () => {
    state.habitsError = true
    await expect(loadLogsContext()).rejects.toThrow(/habits/)
  })

  test('a failed profile read throws, it does not redirect a signed-in user to login', async () => {
    state.profileThrows = true
    await expect(loadLogsContext()).rejects.toThrow(/profile read failed/)
  })

  test('a missing profile row still sends the user to /login?error=perfil', async () => {
    state.profile = null
    await expect(loadLogsContext()).rejects.toThrow('redirect:/login?error=perfil')
  })
})
