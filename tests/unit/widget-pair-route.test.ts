import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('server-only', () => ({}))
const pair = vi.fn()
vi.mock('@/lib/widget-deps', () => ({ supabaseWidgetDeps: () => ({ pair }) }))

import { POST } from '@/app/api/widget/pair/route'

const post = (contentType: string | null, body = JSON.stringify({ code: 'ABCD-2345' })) =>
  new Request('https://x.test/api/widget/pair', {
    method: 'POST',
    headers: contentType ? { 'content-type': contentType } : {},
    body,
  })

beforeEach(() => pair.mockReset())

describe('POST /api/widget/pair content type', () => {
  it('415 for text/plain (a cross-site form post cannot burn the pair bucket)', async () => {
    const r = await POST(post('text/plain'))
    expect(r.status).toBe(415)
    expect(pair).not.toHaveBeenCalled()
  })
  it('415 for form-encoded and for a missing content type', async () => {
    expect((await POST(post('application/x-www-form-urlencoded'))).status).toBe(415)
    expect((await POST(post(null))).status).toBe(415)
    expect(pair).not.toHaveBeenCalled()
  })
  it('accepts application/json, with or without a charset', async () => {
    pair.mockResolvedValue({ status: 'invalid' })
    expect((await POST(post('application/json'))).status).toBe(400)
    expect((await POST(post('application/json; charset=utf-8'))).status).toBe(400)
    expect(pair).toHaveBeenCalledTimes(2)
  })
})
