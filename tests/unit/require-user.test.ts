import { beforeEach, describe, expect, it, vi } from 'vitest'

let getUser: () => Promise<unknown>
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => ({ auth: { getUser: () => getUser() } }) }))

import { requireUser } from '@/lib/require-user'

beforeEach(() => {
  getUser = async () => ({ data: { user: { id: 'u1' } }, error: null })
})

describe('requireUser', () => {
  it('returns the user id and a client', async () => {
    const r = await requireUser()
    expect(r).toMatchObject({ ok: true, userId: 'u1' })
  })

  it('no session: the sign-in copy', async () => {
    getUser = async () => ({ data: { user: null }, error: null })
    expect(await requireUser()).toEqual({ ok: false, error: 'Inicia sesión para continuar.', unavailable: false })
  })

  it.each([
    [{ name: 'AuthSessionMissingError', status: 400 }],
    [{ name: 'AuthApiError', status: 401 }],
  ])('a rejected or missing session (%o) is a sign-in, not a connection problem', async (error) => {
    getUser = async () => ({ data: { user: null }, error })
    expect(await requireUser()).toMatchObject({ ok: false, unavailable: false, error: 'Inicia sesión para continuar.' })
  })

  it.each([
    [{ name: 'AuthRetryableFetchError', status: 0 }],
    [{ name: 'AuthApiError', status: 503 }],
    [{ message: 'odd' }],
  ])('a failed check (%o) is "could not connect"', async (error) => {
    getUser = async () => ({ data: { user: null }, error })
    expect(await requireUser()).toEqual({
      ok: false,
      error: 'No pudimos conectar. Inténtalo de nuevo en unos minutos.',
      unavailable: true,
    })
  })

  it('a getUser that throws is "could not connect"', async () => {
    getUser = async () => {
      throw new TypeError('fetch failed')
    }
    expect(await requireUser()).toMatchObject({ ok: false, unavailable: true })
  })
})
