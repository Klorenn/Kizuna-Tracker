import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const revalidatePath = vi.fn()
let user: { id: string } | null = { id: 'me' }
const client = { auth: { getUser: async () => ({ data: { user }, error: null }) }, rpc }

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => client }))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

const { createWidgetCode, revokeWidgetDevice } = await import('@/app/(app)/perfil/actions')

const ID = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  user = { id: 'me' }
  rpc.mockReset()
  revalidatePath.mockReset()
})

describe('createWidgetCode', () => {
  it('sin sesión no toca la base', async () => {
    user = null
    expect(await createWidgetCode()).toMatchObject({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('devuelve código y vencimiento', async () => {
    rpc.mockResolvedValue({ data: [{ code: 'K7QM4PXD', expires_at: '2026-11-24T12:05:00Z' }], error: null })
    expect(await createWidgetCode()).toEqual({ ok: true, code: 'K7QM4PXD', expiresAt: '2026-11-24T12:05:00Z' })
    expect(rpc).toHaveBeenCalledWith('create_widget_pairing_code')
    expect(revalidatePath).toHaveBeenCalledWith('/perfil/ajustes')
  })
  it('rate_limited -> aviso propio', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rate_limited' } })
    const r = await createWidgetCode()
    expect(r).toMatchObject({ ok: false })
    expect((r as { error: string }).error).toMatch(/demasiados códigos/)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('otro error o forma rara -> mensaje genérico', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    expect(await createWidgetCode()).toMatchObject({ ok: false })
    rpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await createWidgetCode()).toMatchObject({ ok: false })
  })
})

describe('revokeWidgetDevice', () => {
  it('sin sesión no toca la base', async () => {
    user = null
    expect(await revokeWidgetDevice(ID)).toMatchObject({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('id que no es uuid se rechaza sin llamar', async () => {
    expect(await revokeWidgetDevice('x')).toMatchObject({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('revoca y revalida Ajustes', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    expect(await revokeWidgetDevice(ID)).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('revoke_widget_token', { p_token_id: ID })
    expect(revalidatePath).toHaveBeenCalledWith('/perfil/ajustes')
  })
  it('ya revocado (false) también es ok', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    expect(await revokeWidgetDevice(ID)).toEqual({ ok: true })
  })
  it('error de la base -> genérico, sin revalidar', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    expect(await revokeWidgetDevice(ID)).toMatchObject({ ok: false })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
