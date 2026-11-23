import { describe, expect, it } from 'vitest'
import {
  entryMinutes,
  episodeLabel,
  monthlyWatch,
  nextEpisodeHint,
  seriesProgress,
  validateMedia,
  validateWatchInput,
  watchSeries,
  type MediaItem,
  type WatchEntry,
} from '@/domain/watch'

const media = [
  { id: 'dark', title: 'Dark', kind: 'series', totalSeasons: 3, totalEpisodes: 26, runtimeMin: null, status: 'watching', finishedOn: null },
  { id: 'dune', title: 'Dune', kind: 'movie', totalSeasons: null, totalEpisodes: null, runtimeMin: 155, status: 'finished', finishedOn: '2026-11-14' },
  { id: 'pl', title: 'Past Lives', kind: 'movie', totalSeasons: null, totalEpisodes: null, runtimeMin: null, status: 'finished', finishedOn: '2026-11-21' },
  { id: 'arc', title: 'Arcane', kind: 'series', totalSeasons: null, totalEpisodes: null, runtimeMin: null, status: 'watching', finishedOn: null },
  { id: 'pd', title: 'Perfect Days', kind: 'movie', totalSeasons: null, totalEpisodes: null, runtimeMin: 124, status: 'finished', finishedOn: '2026-10-25' },
] as MediaItem[]
const w = (date: string, mediaId: string, o: Partial<WatchEntry>): WatchEntry => ({
  date,
  mediaId,
  episodes: null,
  season: null,
  episodeTo: null,
  minutes: null,
  completed: false,
  ...o,
})
const watched = [
  w('2026-11-05', 'dark', { episodes: 3, season: 1, episodeTo: 3 }),
  w('2026-11-06', 'dark', { episodes: 2, season: 1, episodeTo: 5, minutes: 110 }),
  w('2026-11-14', 'dune', { completed: true }),
  w('2026-11-20', 'pl', { minutes: 50 }),
  w('2026-11-21', 'pl', { minutes: 56, completed: true }),
  w('2026-10-10', 'arc', { episodes: 4, minutes: 160 }),
  w('2026-10-25', 'pd', { completed: true }),
]
const blank = { episodes: null, season: null, episodeTo: null, minutes: null, completed: false }

describe('watch stats', () => {
  it('summarises a month', () => {
    expect(monthlyWatch(watched, media, '2026-11')).toEqual({ month: '2026-11', movies: 2, episodes: 5, minutes: 371, days: 5 })
    expect(monthlyWatch(watched, media, '2026-10')).toEqual({ month: '2026-10', movies: 1, episodes: 4, minutes: 284, days: 2 })
  })
  it('builds a series', () => {
    expect(watchSeries(watched, media, ['2026-10', '2026-11'])).toEqual([
      { month: '2026-10', movies: 1, episodes: 4, minutes: 284 },
      { month: '2026-11', movies: 2, episodes: 5, minutes: 371 },
    ])
  })
  it('computes minutes of an entry without estimating episodes', () => {
    expect(entryMinutes(watched[2], media[1])).toBe(155)
    expect(entryMinutes(watched[0], media[0])).toBe(0)
    expect(entryMinutes(watched[4], media[2])).toBe(56)
    expect(entryMinutes(watched[2], undefined)).toBe(0)
  })
})

describe('series helpers', () => {
  it('labels episodes', () => {
    expect(episodeLabel(1, 6)).toBe('T1 E6')
    expect(episodeLabel(null, 6)).toBe('Episodio 6')
    expect(episodeLabel(2, null)).toBe('Temporada 2')
    expect(episodeLabel(null, null)).toBeNull()
  })
  it('reports progress and the next episode hint', () => {
    expect(seriesProgress(watched, media[0])).toBe('5 de 26 episodios')
    expect(seriesProgress(watched, media[3])).toBe('4 episodios')
    expect(nextEpisodeHint(watched, 'dark')).toEqual({ season: 1, episodeTo: 5 })
    expect(nextEpisodeHint(watched, 'dune')).toEqual({ season: null, episodeTo: null })
  })
})

describe('validation', () => {
  it('validates a watch entry', () => {
    expect(validateWatchInput('series', blank, media[0])).toEqual({ ok: false, error: 'Indica cuántos episodios viste.' })
    expect(validateWatchInput('series', { ...blank, episodes: 2, season: 4 }, media[0])).toEqual({
      ok: false,
      error: 'Dark tiene 3 temporadas.',
    })
    expect(validateWatchInput('movie', blank, media[1])).toEqual({
      ok: false,
      error: 'Indica los minutos o marca que la viste completa.',
    })
    expect(validateWatchInput('series', { ...blank, episodes: 2, season: 1, episodeTo: 5 }, media[0])).toEqual({ ok: true })
    expect(validateWatchInput('movie', { ...blank, completed: true }, media[1])).toEqual({ ok: true })
    expect(validateWatchInput('movie', { ...blank, episodes: 1, completed: true }, media[1]).ok).toBe(false)
  })
  it('validates a title', () => {
    expect(validateMedia({ title: ' ', kind: 'movie', totalSeasons: null, totalEpisodes: null, runtimeMin: null })).toEqual({
      ok: false,
      error: 'Escribe el título.',
    })
    expect(validateMedia({ title: 'Dune', kind: 'movie', totalSeasons: null, totalEpisodes: null, runtimeMin: 601 })).toEqual({
      ok: false,
      error: 'La duración va de 1 a 600 minutos.',
    })
    expect(validateMedia({ title: 'Dark', kind: 'series', totalSeasons: 3, totalEpisodes: 26, runtimeMin: null })).toEqual({ ok: true })
  })
})
