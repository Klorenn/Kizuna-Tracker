import { describe, expect, it } from 'vitest'
import type { HoyState, ReadingSaved } from '@/domain/day-complete'
import { watchStep } from '@/lib/celebration-watch'

const r = (id: string, preset: string | null, done: boolean) => ({ id, preset, hasItems: false, done })
const s = (rows: ReturnType<typeof r>[]): HoyState => ({ done: rows.filter((x) => x.done).length, total: rows.length, rows })

function deps(opts: { held?: boolean; reading?: ReadingSaved | null; claimed?: string[] } = {}) {
  let reading = opts.reading ?? null
  const claimed = new Set(opts.claimed ?? [])
  return {
    held: () => opts.held ?? false,
    take: () => {
      const x = reading
      reading = null
      return x
    },
    claim: (kind: string) => !claimed.has(kind),
    left: () => reading,
  }
}

const open = s([r('w', null, true), r('b', 'read', false)])
const closed = s([r('w', null, true), r('b', 'read', true)])

describe('watchStep (Hoy celebration watcher)', () => {
  it('first render never celebrates and drops a stale reading', () => {
    const d = deps({ reading: { pages: 5, finishedTitle: null } })
    expect(watchStep(null, closed, d)).toEqual({ prev: closed, show: null, deferred: false })
    expect(d.left()).toBeNull()
  })

  it('a reading that completes the day shows "day" only (single sheet)', () => {
    const reading = { pages: 26, finishedTitle: null }
    expect(watchStep(open, closed, deps({ reading })).show).toEqual({ kind: 'day', reading })
  })

  it('falls through when the top pick was already claimed this session: the reading still shows', () => {
    const reading = { pages: 26, finishedTitle: null }
    expect(watchStep(open, closed, deps({ reading, claimed: ['day'] })).show).toEqual({ kind: 'reading', reading })
  })

  it('while a reading sheet holds celebrations nothing is taken and prev stays (deferred)', () => {
    const d = deps({ held: true, reading: { pages: 26, finishedTitle: null } })
    expect(watchStep(open, closed, d)).toEqual({ prev: open, show: null, deferred: true })
    expect(d.left()).not.toBeNull()
  })

  it('bus before refresh: an unchanged state keeps the reading for the refresh that brings the check-in', () => {
    const reading = { pages: 26, finishedTitle: null }
    const d = deps({ reading })
    // the sheet closed (release) before the server refresh arrived: same state, wait
    expect(watchStep(open, open, d)).toEqual({ prev: open, show: null, deferred: false })
    expect(d.left()).toEqual(reading)
    // the refresh arrives: the reading is taken now
    expect(watchStep(open, closed, d).show).toEqual({ kind: 'day', reading })
  })

  it('a failed reading save (bus cleared) after a check-in only celebrates the check-in', () => {
    expect(watchStep(open, closed, deps({ reading: null })).show).toEqual({ kind: 'day', reading: null })
  })
})

describe('watchStep with water', () => {
  it('shows water when it completes and the day stays open; claimed water falls through to nothing', () => {
    const before = s([r('w', 'water', false), r('b', 'read', false)])
    const after = s([r('w', 'water', true), r('b', 'read', false)])
    expect(watchStep(before, after, deps()).show).toEqual({ kind: 'water', reading: null })
    expect(watchStep(before, after, deps({ claimed: ['water'] })).show).toBeNull()
  })
})
