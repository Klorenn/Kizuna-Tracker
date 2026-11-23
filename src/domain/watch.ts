import { monthOf, type MonthKey } from './calendar'
import type { LocalDate } from './types'

// Series and movies: what you watched. Pure functions, no I/O. A watch log is the detail of a
// check-in; it never touches streaks, challenges, debts or goals.

type Result = { ok: true } | { ok: false; error: string }
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

export const MAX_MEDIA_TITLE = 120

export type MediaKind = 'series' | 'movie'

export type MediaItem = {
  id: string
  title: string
  kind: MediaKind
  totalSeasons: number | null
  totalEpisodes: number | null
  runtimeMin: number | null
  status: 'watching' | 'finished'
  finishedOn: LocalDate | null
}
export type MediaInput = Omit<MediaItem, 'id' | 'status' | 'finishedOn'>

const inRange = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max

export function validateMedia(i: MediaInput): Result {
  const title = i.title.trim()
  if (title.length === 0) return fail('Escribe el título.')
  if (title.length > MAX_MEDIA_TITLE) return fail(`El título puede tener hasta ${MAX_MEDIA_TITLE} caracteres.`)
  if (i.kind !== 'series' && i.kind !== 'movie') return fail('Elige si es serie o película.')
  if (i.kind === 'movie') {
    if (i.totalSeasons !== null || i.totalEpisodes !== null) return fail('Una película no lleva temporadas ni episodios.')
    if (i.runtimeMin !== null && !inRange(i.runtimeMin, 1, 600)) return fail('La duración va de 1 a 600 minutos.')
    return { ok: true }
  }
  if (i.runtimeMin !== null) return fail('Una serie no lleva duración.')
  if (i.totalSeasons !== null && !inRange(i.totalSeasons, 1, 100)) return fail('Las temporadas van de 1 a 100.')
  if (i.totalEpisodes !== null && !inRange(i.totalEpisodes, 1, 5000)) return fail('Los episodios van de 1 a 5.000.')
  return { ok: true }
}

export type WatchEntry = {
  date: LocalDate
  mediaId: string
  episodes: number | null
  season: number | null
  episodeTo: number | null
  minutes: number | null
  completed: boolean
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function validateWatchInput(kind: MediaKind, i: Omit<WatchEntry, 'date' | 'mediaId'>, media: MediaItem): Result {
  if (i.minutes !== null && !inRange(i.minutes, 1, 1440)) return fail('Los minutos van de 1 a 1.440.')
  if (kind === 'movie') {
    if (i.episodes !== null || i.season !== null || i.episodeTo !== null) {
      return fail('Una película no lleva episodios ni temporada.')
    }
    if (i.minutes === null && !i.completed) return fail('Indica los minutos o marca que la viste completa.')
    return { ok: true }
  }
  if (i.completed) return fail('Una serie no se marca completa: marca que la terminaste.')
  if (i.episodes === null) return fail('Indica cuántos episodios viste.')
  if (!inRange(i.episodes, 1, 200)) return fail('Los episodios van de 1 a 200.')
  if (media.totalEpisodes !== null && i.episodes > media.totalEpisodes) {
    return fail(`${media.title} tiene ${plural(media.totalEpisodes, 'episodio', 'episodios')}.`)
  }
  if (i.season !== null) {
    if (!inRange(i.season, 1, 100)) return fail('Las temporadas van de 1 a 100.')
    if (media.totalSeasons !== null && i.season > media.totalSeasons) {
      return fail(`${media.title} tiene ${plural(media.totalSeasons, 'temporada', 'temporadas')}.`)
    }
  }
  if (i.episodeTo !== null) {
    if (!inRange(i.episodeTo, 1, 5000)) return fail('El episodio va de 1 a 5.000.')
    if (media.totalEpisodes !== null && i.episodeTo > media.totalEpisodes) {
      return fail(`${media.title} tiene ${plural(media.totalEpisodes, 'episodio', 'episodios')}.`)
    }
  }
  return { ok: true }
}

/** Written minutes; else a completed movie counts its runtime (or 0). Episodes are never estimated. */
export function entryMinutes(e: WatchEntry, media: MediaItem | undefined): number {
  if (e.minutes !== null) return e.minutes
  if (e.completed && media?.kind === 'movie') return media.runtimeMin ?? 0
  return 0
}

export function monthlyWatch(
  entries: WatchEntry[],
  media: MediaItem[],
  month: MonthKey,
): { month: MonthKey; movies: number; episodes: number; minutes: number; days: number } {
  const byId = new Map(media.map((m) => [m.id, m]))
  const inMonth = entries.filter((e) => monthOf(e.date) === month)
  return {
    month,
    movies: media.filter((m) => m.kind === 'movie' && m.finishedOn !== null && monthOf(m.finishedOn) === month).length,
    episodes: inMonth.reduce((sum, e) => sum + (e.episodes ?? 0), 0),
    minutes: inMonth.reduce((sum, e) => sum + entryMinutes(e, byId.get(e.mediaId)), 0),
    days: new Set(inMonth.map((e) => e.date)).size,
  }
}

export function watchSeries(
  entries: WatchEntry[],
  media: MediaItem[],
  months: MonthKey[],
): { month: MonthKey; movies: number; episodes: number; minutes: number }[] {
  return months.map((month) => {
    const { movies, episodes, minutes } = monthlyWatch(entries, media, month)
    return { month, movies, episodes, minutes }
  })
}

/** "T1 E6", "Episodio 6", "Temporada 2"; null when there is nothing to say. */
export function episodeLabel(season: number | null, episodeTo: number | null): string | null {
  if (season !== null && episodeTo !== null) return `T${season} E${episodeTo}`
  if (episodeTo !== null) return `Episodio ${episodeTo}`
  if (season !== null) return `Temporada ${season}`
  return null
}

/** "5 de 26 episodios" (or "4 episodios" when the total is unknown). */
export function seriesProgress(entries: WatchEntry[], media: MediaItem): string {
  const seen = entries.filter((e) => e.mediaId === media.id).reduce((sum, e) => sum + (e.episodes ?? 0), 0)
  if (media.totalEpisodes !== null) return `${seen} de ${media.totalEpisodes} episodios`
  return plural(seen, 'episodio', 'episodios')
}

/** Where to continue a title: the season and episode of its latest entry (nulls if none). */
export function nextEpisodeHint(
  entries: WatchEntry[],
  mediaId: string,
): { season: number | null; episodeTo: number | null } {
  let best: WatchEntry | null = null
  for (const e of entries) {
    if (e.mediaId !== mediaId) continue
    if (best === null || e.date >= best.date) best = e
  }
  return { season: best?.season ?? null, episodeTo: best?.episodeTo ?? null }
}
