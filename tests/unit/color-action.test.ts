import { beforeEach, describe, expect, it, vi } from 'vitest'

const set = vi.fn()
vi.mock('next/headers', () => ({ cookies: async () => ({ set }) }))

import { setColor } from '@/app/theme-actions'

beforeEach(() => set.mockReset())

describe('setColor', () => {
  it.each(['indigo', 'sakura', 'matcha', 'yuzu', 'umi', 'ume', 'sumi'])('stores %s in the color cookie', async (color) => {
    await expect(setColor(color)).resolves.toEqual({ ok: true })
    expect(set).toHaveBeenCalledWith('color', color, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      httpOnly: true,
      secure: false,
    })
  })

  it('needs no session: it only touches the cookie store (the mock exposes nothing else)', async () => {
    await expect(setColor('sakura')).resolves.toEqual({ ok: true })
    expect(set).toHaveBeenCalledTimes(1)
  })

  it('refuses anything else without touching the cookie', async () => {
    for (const bad of ['', 'SAKURA', 'rojo', 'sakura;path=/', 'dark', 42 as unknown as string, null as unknown as string]) {
      await expect(setColor(bad)).resolves.toEqual({ ok: false, error: 'Ese color no está disponible.' })
    }
    expect(set).not.toHaveBeenCalled()
  })
})
