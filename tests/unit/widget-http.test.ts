import { beforeEach, describe, expect, it, vi } from 'vitest'

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

import { readJson, respond } from '@/lib/widget-http'

beforeEach(() => revalidatePath.mockReset())

describe('respond', () => {
  it('status, cuerpo y Cache-Control private, no-store', async () => {
    const r = respond({ status: 200, body: { a: 1 } })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ a: 1 })
    expect(r.headers.get('Cache-Control')).toBe('private, no-store')
    expect(r.headers.get('Retry-After')).toBeNull()
  })
  it('429 lleva Retry-After', () => {
    const r = respond({ status: 429, body: {}, retryAfter: 900 })
    expect(r.headers.get('Retry-After')).toBe('900')
    expect(r.headers.get('Cache-Control')).toBe('private, no-store')
  })
  it('revalida solo las rutas del resultado', () => {
    respond({ status: 200, body: {}, revalidate: ['/', '/habitos/x'] })
    expect(revalidatePath.mock.calls).toEqual([['/'], ['/habitos/x']])
  })
  it('sin revalidate no revalida', () => {
    respond({ status: 422, body: {} })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('readJson', () => {
  it('parsea JSON', async () => {
    expect(await readJson(new Request('http://x', { method: 'POST', body: '{"a":1}' }))).toEqual({ a: 1 })
  })
  it('null si el cuerpo no es JSON', async () => {
    expect(await readJson(new Request('http://x', { method: 'POST', body: 'nope' }))).toBeNull()
  })
  it('null si el cuerpo es demasiado grande', async () => {
    expect(await readJson(new Request('http://x', { method: 'POST', body: JSON.stringify({ a: 'x'.repeat(5000) }) }))).toBeNull()
  })
})
