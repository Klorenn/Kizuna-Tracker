import { describe, expect, it } from 'vitest'
import { loggedCoverage } from '@/lib/watch-coverage'

type Row = { episodes: number | null; season: number | null; episode_to: number | null }
const row = (episodes: number | null, season: number | null, episode_to: number | null): Row => ({ episodes, season, episode_to })

describe('loggedCoverage', () => {
  it('is empty without entries', () => {
    expect(loggedCoverage([])).toEqual({ episodes: 0, season: 0 })
  })

  it('counts distinct episodes: a rewatch of the same ones adds nothing', () => {
    // 1x1-1x5 on Monday, the same five again on Friday
    expect(loggedCoverage([row(5, 1, 5), row(5, 1, 5)])).toEqual({ episodes: 5, season: 1 })
  })

  it('a partial overlap only counts the new episodes', () => {
    // 1x1-1x5, then 1x4-1x8
    expect(loggedCoverage([row(5, 1, 5), row(5, 1, 8)])).toEqual({ episodes: 8, season: 1 })
  })

  it('the same episode number in another season is another episode', () => {
    expect(loggedCoverage([row(3, 1, 3), row(3, 2, 3)])).toEqual({ episodes: 6, season: 2 })
  })

  it('entries without a position add up (nothing to compare them with)', () => {
    expect(loggedCoverage([row(2, null, null), row(3, null, null)])).toEqual({ episodes: 5, season: 0 })
  })

  it('never goes below the highest episode logged', () => {
    expect(loggedCoverage([row(1, null, 12)])).toEqual({ episodes: 12, season: 0 })
  })

  it('a run longer than its end episode does not reach below episode 1', () => {
    expect(loggedCoverage([row(5, 1, 3)])).toEqual({ episodes: 5, season: 1 })
  })
})
