import { beforeEach, describe, expect, it, vi } from 'vitest'

const set = vi.fn()
vi.mock('next/headers', () => ({ cookies: async () => ({ set }) }))

import { setTheme } from '@/app/theme-actions'

beforeEach(() => set.mockReset())

describe('setTheme', () => {
  it.each(['system', 'light', 'dark'])('stores %s in the theme cookie', async (theme) => {
    await expect(setTheme(theme)).resolves.toEqual({ ok: true })
    expect(set).toHaveBeenCalledWith('theme', theme, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      httpOnly: true,
      secure: false,
    })
  })

  it('refuses anything else without touching the cookie', async () => {
    for (const bad of ['', 'DARK', 'sepia', 'dark;path=/', 42 as unknown as string]) {
      await expect(setTheme(bad)).resolves.toEqual({ ok: false, error: 'Ese tema no está disponible.' })
    }
    expect(set).not.toHaveBeenCalled()
  })
})
