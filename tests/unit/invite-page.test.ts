import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    rpc,
  }),
}))
vi.mock('@/lib/viewer', () => ({
  getViewer: async () => ({ id: 'me', timezone: 'UTC', deletedAt: null }),
}))
vi.mock('@/app/(app)/amigos/actions', () => ({ acceptInviteAction: vi.fn() }))
const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect }))

import InvitePage from '@/app/invite/[code]/page'

beforeEach(() => {
  rpc.mockReset()
  redirect.mockClear()
})

describe('invite page', () => {
  it('never accepts on render: only the read-only preview is called', async () => {
    rpc.mockResolvedValue({ data: { username: 'pau_k', displayName: 'Pau Koh' }, error: null })
    await InvitePage({ params: Promise.resolve({ code: 'abc' }) })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('invite_preview', { p_code: 'abc' })
    expect(rpc).not.toHaveBeenCalledWith('accept_invite', expect.anything())
  })

  it('also does not accept when the preview is empty', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await InvitePage({ params: Promise.resolve({ code: 'abc' }) })
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['invite_preview'])
  })
})
