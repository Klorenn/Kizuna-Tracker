import { describe, expect, it } from 'vitest'
import { groupErrors, isAdminUser } from '@/lib/client-errors/admin'

describe('isAdminUser', () => {
  const id = '3f2b8c1e-1111-4222-8333-444455556666'
  it('matches an id in the comma list, trimming spaces', () => {
    expect(isAdminUser(id, ` x , ${id} `)).toBe(true)
  })
  it('is false for missing env, empty, missing user or a partial match', () => {
    expect(isAdminUser(id, undefined)).toBe(false)
    expect(isAdminUser(id, '')).toBe(false)
    expect(isAdminUser(null, id)).toBe(false)
    expect(isAdminUser(id.slice(0, 8), id)).toBe(false)
    expect(isAdminUser('', ',')).toBe(false)
  })
})

describe('groupErrors', () => {
  const row = (o: Partial<Record<string, unknown>>) => ({ fingerprint: 'f1', kind: 'error', message: 'm', stack: 's', url_path: '/a', ua_kind: 'browser', release: 'abc1234', count: 1, last_seen_at: '2026-11-24T10:00:00Z', ...o })
  it('sums hour buckets per fingerprint and keeps the latest sighting', () => {
    const g = groupErrors([row({ count: 2, last_seen_at: '2026-11-24T10:00:00Z' }), row({ count: 3, last_seen_at: '2026-11-24T12:00:00Z', release: 'new' }), row({ fingerprint: 'f2' })])
    expect(g).toHaveLength(2)
    const f1 = g.find((x) => x.fingerprint === 'f1')!
    expect(f1.count).toBe(5)
    expect(f1.lastSeen).toBe('2026-11-24T12:00:00Z')
    expect(f1.release).toBe('new')
  })
  it('orders by last seen, newest first', () => {
    const g = groupErrors([row({ fingerprint: 'a', last_seen_at: '2026-11-24T10:00:00Z' }), row({ fingerprint: 'b', last_seen_at: '2026-11-24T11:00:00Z' })])
    expect(g.map((x) => x.fingerprint)).toEqual(['b', 'a'])
  })
})
