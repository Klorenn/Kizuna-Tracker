import { describe, expect, it, vi } from 'vitest'
import { ingestClientError, type IngestDeps } from '@/lib/client-errors/ingest'

const body = JSON.stringify({ kind: 'error', message: 'boom', stack: 'at f (https://a.com/c.js:1:2)', path: '/perfil?x=1' })
const input = (o: Record<string, unknown> = {}) => ({ rawBody: body, ipBucket: '1.2.3.4', userId: null as string | null, ua: 'Mozilla/5.0', release: 'abcdef1', ...o })
const deps = (o: Partial<IngestDeps> = {}): IngestDeps & { record: ReturnType<typeof vi.fn>; limited: ReturnType<typeof vi.fn> } => {
  const record = vi.fn(async () => {})
  const limited = vi.fn(async () => false)
  return { record, limited, ...o } as never
}

describe('ingestClientError', () => {
  it('records a sanitized row with server-derived fields', async () => {
    const d = deps()
    await ingestClientError(d, input({ ua: 'X KizunaNative/7', userId: 'u1' }))
    expect(d.record).toHaveBeenCalledOnce()
    expect(d.record.mock.calls[0][0]).toMatchObject({ kind: 'error', message: 'boom', url_path: '/perfil', ua_kind: 'native', app_version: '7', release: 'abcdef1', user_id: 'u1' })
    expect(d.record.mock.calls[0][0].fingerprint).toMatch(/^[0-9a-f]{32}$/)
  })
  it('never takes the user id from the body', async () => {
    const d = deps()
    await ingestClientError(d, input({ rawBody: JSON.stringify({ kind: 'error', message: 'm', user_id: 'evil' }) }))
    expect(d.record).not.toHaveBeenCalled()
    const d2 = deps()
    await ingestClientError(d2, input({ userId: null }))
    expect(d2.record.mock.calls[0][0].user_id).toBeNull()
  })
  it('drops invalid JSON, invalid payloads, oversized bodies and noise without touching the DB', async () => {
    for (const raw of ['{', '[]', JSON.stringify({ kind: 'x', message: 'm' }), 'x'.repeat(9000), JSON.stringify({ kind: 'error', message: 'ResizeObserver loop limit exceeded' })]) {
      const d = deps()
      await ingestClientError(d, input({ rawBody: raw }))
      expect(d.limited).not.toHaveBeenCalled()
      expect(d.record).not.toHaveBeenCalled()
    }
  })
  it('checks the ip bucket and, if signed in, the user bucket, with a new key family', async () => {
    const d = deps()
    await ingestClientError(d, input({ userId: 'u1' }))
    const keys = d.limited.mock.calls.map((c) => c[0].key)
    expect(keys).toEqual(['cerr:ip:1.2.3.4', 'cerr:user:u1', 'cerr:global'])
  })
  it('the global bucket is 300 per hour and is checked for anonymous reports too', async () => {
    const d = deps()
    await ingestClientError(d, input())
    expect(d.limited.mock.calls.map((c) => c[0])).toContainEqual({ key: 'cerr:global', limit: 300, windowSeconds: 3600 })
  })
  it('fails CLOSED when only the global limiter errors', async () => {
    const d = deps({ limited: vi.fn(async (a: { key: string }) => { if (a.key === 'cerr:global') throw new Error('down'); return false }) as never })
    await ingestClientError(d, input())
    expect(d.record).not.toHaveBeenCalled()
  })
  it('limiters run before any sanitizing', async () => {
    const order: string[] = []
    const d = deps({ limited: vi.fn(async () => { order.push('limit'); return true }) as never })
    const big = JSON.stringify({ kind: 'error', message: 'me@a.com '.repeat(200), stack: 'a'.repeat(5000) })
    await ingestClientError(d, input({ rawBody: big }))
    expect(order).toEqual(['limit'])
    expect(d.record).not.toHaveBeenCalled()
  })
  it('refuses kind server without a session, accepts it with one', async () => {
    const raw = JSON.stringify({ kind: 'server', message: 'digest 1' })
    const a = deps()
    await ingestClientError(a, input({ rawBody: raw, userId: null }))
    expect(a.limited).not.toHaveBeenCalled()
    expect(a.record).not.toHaveBeenCalled()
    const b = deps()
    await ingestClientError(b, input({ rawBody: raw, userId: 'u1' }))
    expect(b.record).toHaveBeenCalledOnce()
  })
  it('drops silently when limited', async () => {
    const d = deps({ limited: vi.fn(async () => true) as never })
    await ingestClientError(d, input())
    expect(d.record).not.toHaveBeenCalled()
  })
  it('fails open for ip and user limiters if they themselves error', async () => {
    const d = deps({ limited: vi.fn(async (a: { key: string }) => { if (a.key !== 'cerr:global') throw new Error('db down'); return false }) as never })
    await ingestClientError(d, input())
    expect(d.record).toHaveBeenCalledOnce()
  })
  it('never throws, even if the write fails', async () => {
    const d = deps({ record: vi.fn(async () => { throw new Error('write failed') }) as never })
    await expect(ingestClientError(d, input())).resolves.toBeUndefined()
  })
})
