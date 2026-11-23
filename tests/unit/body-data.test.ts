import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { loadRecentWeights, loadWeights } from '@/app/(app)/perfil/body-data'

type Row = { id: string; measured_on: string; weight_kg: number }
type Call = { filters: [string, unknown[]][]; range?: [number, number]; limit?: number }

/** Fake query builder over `rows` (newest first) that records filters and honours range/limit. */
function fakeClient(rows: Row[]) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      expect(table).toBe('body_weights')
      return {
        select() {
          const call: Call = { filters: [] }
          calls.push(call)
          const b: Record<string, unknown> = {}
          for (const f of ['eq', 'gte', 'lt', 'order']) {
            b[f] = (...args: unknown[]) => {
              call.filters.push([f, args])
              return b
            }
          }
          b.range = (a: number, z: number) => {
            call.range = [a, z]
            return b
          }
          b.limit = (n: number) => {
            call.limit = n
            return b
          }
          b.then = (res: (v: unknown) => unknown) => {
            let out = rows
            const lt = call.filters.find(([f]) => f === 'lt')
            const gte = call.filters.find(([f]) => f === 'gte')
            if (gte) out = out.filter((r) => r.measured_on >= String(gte[1][1]))
            if (lt) out = out.filter((r) => r.measured_on < String(lt[1][1]))
            if (call.range) out = out.slice(call.range[0], call.range[1] + 1)
            if (call.limit !== undefined) out = out.slice(0, call.limit)
            return res({ data: out, error: null })
          }
          return b
        },
      }
    },
  }
  return { client, calls }
}

describe('loadRecentWeights', () => {
  it('asks only for the user own rows, newest first, limited', async () => {
    const { client, calls } = fakeClient([
      { id: 'a', measured_on: '2026-11-20', weight_kg: 71.2 },
      { id: 'b', measured_on: '2026-11-05', weight_kg: 71.9 },
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await loadRecentWeights(client as any, 'me', 5)
    expect(out).toEqual([
      { id: 'a', date: '2026-11-20', kg: 71.2 },
      { id: 'b', date: '2026-11-05', kg: 71.9 },
    ])
    expect(calls[0].filters).toContainEqual(['eq', ['user_id', 'me']])
    expect(calls[0].filters).toContainEqual(['order', ['measured_on', { ascending: false }]])
    expect(calls[0].limit).toBe(5)
  })
})

describe('loadWeights', () => {
  it('returns rows newest first plus the last entry before the range start', async () => {
    const { client } = fakeClient([
      { id: 'a', measured_on: '2026-11-20', weight_kg: 71.2 },
      { id: 'b', measured_on: '2026-09-05', weight_kg: 71.9 },
      { id: 'c', measured_on: '2026-07-30', weight_kg: 72.8 },
      { id: 'd', measured_on: '2026-05-01', weight_kg: 73.5 },
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await loadWeights(client as any, 'me', '2026-08-22')
    expect(out.rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(out.before).toEqual({ date: '2026-07-30', kg: 72.8 })
  })

  it('has no lower bound and no "before" for Todo', async () => {
    const { client } = fakeClient([{ id: 'a', measured_on: '2026-11-20', weight_kg: 71.2 }])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await loadWeights(client as any, 'me', null)
    expect(out.rows).toHaveLength(1)
    expect(out.before).toBeNull()
  })

  it('pages past the 1000 row API cap ', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({
      id: `id-${i}`,
      measured_on: `2026-01-01`,
      weight_kg: 70,
    }))
    const { client, calls } = fakeClient(rows)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await loadWeights(client as any, 'me', null)
    expect(out.rows).toHaveLength(2500)
    expect(calls.map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })
})
