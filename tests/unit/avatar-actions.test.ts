import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const getUser = vi.fn()
const remove = vi.fn()
const update = vi.fn()
const eq = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser }, rpc }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: { from: (b: string) => ({ remove: (p: string[]) => remove(b, p) }) },
    from: (t: string) => ({
      update: (v: unknown) => {
        update(t, v)
        return { eq }
      },
    }),
  }),
}))

import { removeAvatar, setAvatarPreset } from '@/app/(app)/perfil/avatar-actions'

beforeEach(() => {
  for (const m of [rpc, getUser, remove, update, eq]) m.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  rpc.mockResolvedValue({ error: null })
  remove.mockResolvedValue({ error: null })
  eq.mockResolvedValue({ error: null })
})

describe('setAvatarPreset', () => {
  it('calls the RPC with a valid preset', async () => {
    await expect(setAvatarPreset(5)).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('set_avatar_preset', { p_preset: 5 })
  })

  it('refuses out-of-range or non-integer values without calling the database', async () => {
    for (const bad of [0, 9, 2.5, NaN, '3' as unknown as number, null as unknown as number]) {
      await expect(setAvatarPreset(bad)).resolves.toMatchObject({ ok: false })
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('needs a session', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await expect(setAvatarPreset(2)).resolves.toMatchObject({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('turns a database error into a neutral message', async () => {
    rpc.mockResolvedValue({ error: { message: 'boom' } })
    await expect(setAvatarPreset(2)).resolves.toEqual({
      ok: false,
      error: 'No pudimos guardar el avatar. Inténtalo de nuevo.',
    })
  })
})

describe('removeAvatar', () => {
  it('deletes the uploaded file and clears the photo columns so the preset shows', async () => {
    await expect(removeAvatar()).resolves.toEqual({ ok: true })
    expect(remove).toHaveBeenCalledWith('avatars', ['u1.jpg'])
    expect(update).toHaveBeenCalledWith('profiles', { avatar_path: null, avatar_updated_at: null })
    expect(eq).toHaveBeenCalledWith('id', 'u1')
  })

  it('needs a session', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await expect(removeAvatar()).resolves.toMatchObject({ ok: false })
    expect(update).not.toHaveBeenCalled()
  })

  it('reports a failed profile update', async () => {
    eq.mockResolvedValue({ error: { message: 'x' } })
    await expect(removeAvatar()).resolves.toMatchObject({ ok: false })
  })
})
