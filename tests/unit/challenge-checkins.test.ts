import { describe, expect, it } from 'vitest'
import { readChallengeCheckins } from '@/lib/challenge-checkins'

function pagedDb(total: number) {
  const ranges: [number, number][] = []
  const orders: string[] = []
  const all = Array.from({ length: total }, (_, n) => ({ id: `k${n}`, habit_id: 'h1' }))
  const db = {
    from: () => {
      let r: [number, number] = [0, 999]
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'in', 'gte', 'lte']) b[m] = () => b
      b.order = (col: string) => {
        orders.push(col)
        return b
      }
      b.range = (from: number, to: number) => {
        r = [from, to]
        ranges.push(r)
        return b
      }
      b.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: all.slice(r[0], Math.min(r[1] + 1, r[0] + 1000)), error: null }).then(resolve)
      return b
    },
  }
  return { db: db as never, ranges, orders }
}

describe('readChallengeCheckins', () => {
  it('reads past max_rows, newest first with the id as a stable tiebreaker', async () => {
    const { db, ranges, orders } = pagedDb(2100)
    const rows = await readChallengeCheckins(db, ['h1'], '2026-11-23', '2026-12-20')
    expect(rows).toHaveLength(2100)
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
    expect(orders.slice(0, 2)).toEqual(['created_at', 'id'])
  })
})
