import { monthOf, shiftMonth, type MonthKey } from './calendar'
import { cardioSummary, type CardioKind } from './cardio'
import { progressLabel, type QuantityConfig } from './quantity'
import { formatDuration } from './time'
import type { LocalDate } from './types'
import type { MediaKind } from './watch'

// Detailed logs: what you read, trained, spent time on, watched, measured or covered. Pure
// functions, no I/O. They never touch streaks, challenges, debts or goals: a log is the detail
// of a check-in, nothing more (quantity is the declared exception, handled by the server).

export type LogType = 'none' | 'reading' | 'workout' | 'time' | 'watch' | 'quantity' | 'cardio'
export const LOG_TYPES: readonly LogType[] = ['none', 'reading', 'workout', 'time', 'watch', 'quantity', 'cardio']
export const LOG_TYPE_LABEL: Readonly<Record<LogType, string>> = {
  none: 'Ninguno',
  reading: 'Lectura',
  workout: 'Entrenamiento',
  time: 'Tiempo',
  watch: 'Series y películas',
  quantity: 'Cantidad',
  cardio: 'Distancia',
}

export type DayType = 'legs' | 'chest' | 'back' | 'shoulders' | 'arms' | 'core' | 'cardio' | 'full_body'
export const DAY_TYPES: readonly DayType[] = [
  'legs',
  'chest',
  'back',
  'shoulders',
  'arms',
  'core',
  'cardio',
  'full_body',
]
export const DAY_TYPE_LABEL: Readonly<Record<DayType, string>> = {
  legs: 'Pierna',
  chest: 'Pecho',
  back: 'Espalda',
  shoulders: 'Hombros',
  arms: 'Brazos',
  core: 'Core',
  cardio: 'Cardio',
  full_body: 'Cuerpo completo',
}

export type MuscleGroup = Exclude<DayType, 'cardio' | 'full_body'>
export const MUSCLE_GROUPS: readonly MuscleGroup[] = ['legs', 'chest', 'back', 'shoulders', 'arms', 'core']

type Result = { ok: true } | { ok: false; error: string }
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** Sums and averages of kg are rounded to 2 decimals so float noise never reaches the UI. */
const round2 = (x: number) => Math.round(x * 100) / 100

export const MAX_PAGES = 20000
export const MAX_BOOK_TITLE = 120
export const MAX_BOOK_AUTHOR = 80
export const MAX_EXERCISES = 20
export const MAX_SETS_PER_EXERCISE = 10

// ------------------------------------------------------------------ months

/** The `n` months ending at `current`, oldest first. */
export function lastMonths(current: MonthKey, n: number): MonthKey[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(current, i - (n - 1)))
}

// ------------------------------------------------------------------ reading

export type Book = {
  id: string
  title: string
  author: string | null
  totalPages: number | null
  status: 'reading' | 'finished'
  finishedOn: LocalDate | null
}
export type BookInput = { title: string; author: string | null; totalPages: number | null }
export type ReadingEntry = { date: LocalDate; bookId: string; fromPage: number; toPage: number }

export function validateBook(i: BookInput): Result {
  const title = i.title.trim()
  if (title.length === 0) return fail('Ponle un título al libro.')
  if (title.length > MAX_BOOK_TITLE) return fail(`El título puede tener hasta ${MAX_BOOK_TITLE} caracteres.`)
  if (i.author !== null) {
    const author = i.author.trim()
    if (author.length === 0 || author.length > MAX_BOOK_AUTHOR) {
      return fail(`El autor puede tener hasta ${MAX_BOOK_AUTHOR} caracteres.`)
    }
  }
  if (i.totalPages !== null && (!Number.isInteger(i.totalPages) || i.totalPages < 1 || i.totalPages > MAX_PAGES)) {
    return fail(`Las páginas del libro van de 1 a ${MAX_PAGES}.`)
  }
  return { ok: true }
}

export const pagesRead = (e: { fromPage: number; toPage: number }): number => e.toPage - e.fromPage

/** "26 páginas", "1 página"; a reading that stayed on the same page is "Sin páginas nuevas". */
export function pagesLabel(pages: number): string {
  if (pages === 0) return 'Sin páginas nuevas'
  return pages === 1 ? '1 página' : `${pages} páginas`
}

export function validateReadingInput(i: { fromPage: number; toPage: number; totalPages: number | null }): Result {
  if (!Number.isInteger(i.fromPage) || !Number.isInteger(i.toPage)) return fail('Usa números enteros.')
  if (i.fromPage < 0 || i.toPage < 0) return fail('Las páginas empiezan en 0.')
  if (i.toPage < i.fromPage) return fail('La página final no puede ser menor que la inicial.')
  if (i.totalPages !== null && i.toPage > i.totalPages) return fail(`El libro tiene ${i.totalPages} páginas.`)
  if (i.toPage > MAX_PAGES) return fail(`Las páginas van hasta ${MAX_PAGES}.`)
  return { ok: true }
}

/** Where to continue a book: the last page reached (latest day wins), or 0 if never read. */
export function nextFromPage(entries: ReadingEntry[], bookId: string): number {
  let best: ReadingEntry | null = null
  for (const e of entries) {
    if (e.bookId !== bookId) continue
    if (best === null || e.date > best.date || (e.date === best.date && e.toPage > best.toPage)) best = e
  }
  return best?.toPage ?? 0
}

export function monthlyReading(
  entries: ReadingEntry[],
  books: Book[],
  month: MonthKey,
): { month: MonthKey; pages: number; days: number; booksFinished: { id: string; title: string }[] } {
  const inMonth = entries.filter((e) => monthOf(e.date) === month)
  const booksFinished = books
    .filter((b) => b.status === 'finished' && b.finishedOn !== null && monthOf(b.finishedOn) === month)
    .sort((a, b) => (a.finishedOn as string).localeCompare(b.finishedOn as string))
    .map((b) => ({ id: b.id, title: b.title }))
  return {
    month,
    pages: inMonth.reduce((sum, e) => sum + pagesRead(e), 0),
    days: new Set(inMonth.map((e) => e.date)).size,
    booksFinished,
  }
}

export function readingSeries(
  entries: ReadingEntry[],
  books: Book[],
  months: MonthKey[],
): { month: MonthKey; pages: number; books: number }[] {
  return months.map((month) => {
    const m = monthlyReading(entries, books, month)
    return { month, pages: m.pages, books: m.booksFinished.length }
  })
}

// ------------------------------------------------------------------ workouts

export type ExerciseRef = { id: string; name: string; group: MuscleGroup }
export type WorkoutSet = { sessionId: string; date: LocalDate; exerciseId: string; reps: number; kg: number }
export type WorkoutDraft = {
  dayTypes: DayType[]
  exercises: { exerciseId: string; sets: { reps: number; kg: number }[] }[]
}

const hasAtMost2Decimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6

export function validateWorkoutDraft(d: WorkoutDraft): Result {
  if (d.dayTypes.length === 0) return fail('Elige al menos un tipo de día.')
  if (new Set(d.dayTypes).size !== d.dayTypes.length || d.dayTypes.some((t) => !DAY_TYPES.includes(t))) {
    return fail('Elige tipos de día distintos.')
  }
  if (d.exercises.length > MAX_EXERCISES) return fail(`Puedes registrar hasta ${MAX_EXERCISES} ejercicios.`)
  if (new Set(d.exercises.map((e) => e.exerciseId)).size !== d.exercises.length) {
    return fail('Ese ejercicio ya está en la lista.')
  }
  for (const e of d.exercises) {
    if (e.sets.length === 0) return fail('Agrega al menos una serie a cada ejercicio.')
    if (e.sets.length > MAX_SETS_PER_EXERCISE) {
      return fail(`Puedes registrar hasta ${MAX_SETS_PER_EXERCISE} series por ejercicio.`)
    }
    for (const s of e.sets) {
      if (!Number.isInteger(s.reps) || s.reps < 1 || s.reps > 1000) return fail('Las repeticiones van de 1 a 1000.')
      if (!Number.isFinite(s.kg) || s.kg < 0 || s.kg > 999.99 || !hasAtMost2Decimals(s.kg)) {
        return fail('El peso va de 0 a 999,99 kg.')
      }
    }
  }
  return { ok: true }
}

/** The `p_sets` argument of `save_workout`, in the order the user entered them. */
export function toSetsPayload(d: WorkoutDraft): { exercise_id: string; reps: number; kg: number }[] {
  return d.exercises.flatMap((e) => e.sets.map((s) => ({ exercise_id: e.exerciseId, reps: s.reps, kg: s.kg })))
}

const sameTypes = (a: DayType[], b: DayType[]) => a.length === b.length && a.every((t) => b.includes(t))

/**
 * "Repetir último": the latest earlier workout with the same day types (any order), else the
 * latest earlier one that shares at least one. Returns the requested day types with a copy of
 * its exercises; null when there is nothing to repeat.
 */
export function prefillFromLast(
  sessions: ({ date: LocalDate } & WorkoutDraft)[],
  dayTypes: DayType[],
  today: LocalDate,
): WorkoutDraft | null {
  const past = sessions.filter((s) => s.date < today).sort((a, b) => b.date.localeCompare(a.date))
  const pick = past.find((s) => sameTypes(s.dayTypes, dayTypes)) ?? past.find((s) => s.dayTypes.some((t) => dayTypes.includes(t)))
  if (!pick) return null
  return {
    dayTypes: [...dayTypes],
    exercises: pick.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.map((s) => ({ ...s })) })),
  }
}

// ------------------------------------------------------------------ workout stats

export function gymVisits(dates: LocalDate[], month: MonthKey): number {
  return new Set(dates.filter((d) => monthOf(d) === month)).size
}

export function visitSeries(dates: LocalDate[], months: MonthKey[]): { month: MonthKey; count: number }[] {
  return months.map((month) => ({ month, count: gymVisits(dates, month) }))
}

/** Heaviest kg per exercise within the month (0 = bodyweight is kept). */
export function bestByExercise(sets: WorkoutSet[], month: MonthKey): Map<string, number> {
  const best = new Map<string, number>()
  for (const s of sets) {
    if (monthOf(s.date) !== month) continue
    best.set(s.exerciseId, Math.max(best.get(s.exerciseId) ?? 0, s.kg))
  }
  return best
}

export type ExerciseDelta = {
  exerciseId: string
  name: string
  previousKg: number | null
  currentKg: number
  deltaKg: number | null
}
export type GroupDelta = { group: MuscleGroup; deltaKg: number | null; volumeKg: number; exercises: ExerciseDelta[] }

const byDelta = (a: ExerciseDelta, b: ExerciseDelta) => {
  if (a.deltaKg === null && b.deltaKg === null) return a.name.localeCompare(b.name, 'es')
  if (a.deltaKg === null) return 1
  if (b.deltaKg === null) return -1
  return b.deltaKg - a.deltaKg || a.name.localeCompare(b.name, 'es')
}

/**
 * Per muscle group with sets in `month`: how much its exercises' best kg rose against the
 * previous month (sum of the exercises present with weight in both months; null if none), and
 * the volume (reps x kg). Only groups trained that month, in MUSCLE_GROUPS order.
 */
export function groupDeltas(sets: WorkoutSet[], exercises: ExerciseRef[], month: MonthKey): GroupDelta[] {
  const current = bestByExercise(sets, month)
  const previous = bestByExercise(sets, shiftMonth(month, -1))
  const refs = new Map(exercises.map((e) => [e.id, e]))
  const volume = new Map<MuscleGroup, number>()
  for (const s of sets) {
    if (monthOf(s.date) !== month) continue
    const ref = refs.get(s.exerciseId)
    if (ref) volume.set(ref.group, (volume.get(ref.group) ?? 0) + s.reps * s.kg)
  }

  const out: GroupDelta[] = []
  for (const group of MUSCLE_GROUPS) {
    const rows: ExerciseDelta[] = []
    for (const e of exercises) {
      if (e.group !== group || !current.has(e.id)) continue
      const currentKg = current.get(e.id) as number
      const prev = previous.get(e.id)
      const previousKg = prev === undefined || prev === 0 ? null : prev
      rows.push({
        exerciseId: e.id,
        name: e.name,
        previousKg,
        currentKg,
        deltaKg: previousKg === null || currentKg === 0 ? null : round2(currentKg - previousKg),
      })
    }
    if (rows.length === 0) continue
    rows.sort(byDelta)
    const known = rows.filter((r) => r.deltaKg !== null)
    out.push({
      group,
      deltaKg: known.length === 0 ? null : round2(known.reduce((sum, r) => sum + (r.deltaKg as number), 0)),
      volumeKg: round2(volume.get(group) ?? 0),
      exercises: rows,
    })
  }
  return out
}

/** The group trained on the most distinct sessions in the month (ties: MUSCLE_GROUPS order). */
export function headlineGroup(
  sets: WorkoutSet[],
  exercises: ExerciseRef[],
  month: MonthKey,
): { group: MuscleGroup; deltaKg: number | null } | null {
  const refs = new Map(exercises.map((e) => [e.id, e]))
  const sessions = new Map<MuscleGroup, Set<string>>()
  for (const s of sets) {
    if (monthOf(s.date) !== month) continue
    const ref = refs.get(s.exerciseId)
    if (!ref) continue
    const set = sessions.get(ref.group) ?? new Set<string>()
    set.add(s.sessionId)
    sessions.set(ref.group, set)
  }
  let best: MuscleGroup | null = null
  for (const group of MUSCLE_GROUPS) {
    const n = sessions.get(group)?.size ?? 0
    if (n > 0 && (best === null || n > (sessions.get(best)?.size ?? 0))) best = group
  }
  if (best === null) return null
  const delta = groupDeltas(sets, exercises, month).find((g) => g.group === best)
  return { group: best, deltaKg: delta?.deltaKg ?? null }
}

export function groupDeltaSeries(
  sets: WorkoutSet[],
  exercises: ExerciseRef[],
  group: MuscleGroup,
  months: MonthKey[],
): { month: MonthKey; deltaKg: number | null }[] {
  return months.map((month) => ({
    month,
    deltaKg: groupDeltas(sets, exercises, month).find((g) => g.group === group)?.deltaKg ?? null,
  }))
}

/** Total kg moved (reps x kg) per month, optionally only one muscle group. */
export function volumeSeries(
  sets: WorkoutSet[],
  exercises: ExerciseRef[],
  months: MonthKey[],
  group?: MuscleGroup,
): { month: MonthKey; kg: number }[] {
  const refs = new Map(exercises.map((e) => [e.id, e]))
  return months.map((month) => {
    let kg = 0
    for (const s of sets) {
      if (monthOf(s.date) !== month) continue
      if (group !== undefined && refs.get(s.exerciseId)?.group !== group) continue
      kg += s.reps * s.kg
    }
    return { month, kg: round2(kg) }
  })
}

/** Best kg of one exercise on each day it was trained, oldest first. */
export function exerciseProgress(sets: WorkoutSet[], exerciseId: string): { date: LocalDate; bestKg: number }[] {
  const byDate = new Map<LocalDate, number>()
  for (const s of sets) {
    if (s.exerciseId !== exerciseId) continue
    byDate.set(s.date, Math.max(byDate.get(s.date) ?? 0, s.kg))
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, bestKg]) => ({ date, bestKg }))
}

// ------------------------------------------------------------------ formatting and copy

const GROUP_LOWER: Readonly<Record<MuscleGroup, string>> = {
  legs: 'pierna',
  chest: 'pecho',
  back: 'espalda',
  shoulders: 'hombros',
  arms: 'brazos',
  core: 'core',
}

/** 42,5 / 3.835 (es-CL separators, no ICU needed): at most 2 decimals, no trailing zeros. */
function formatNumber(n: number): string {
  const [int, frac] = Math.abs(round2(n)).toFixed(2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const decimals = frac.replace(/0+$/, '')
  return decimals ? `${grouped},${decimals}` : grouped
}

export const formatKg = (n: number): string => `${n < 0 ? '-' : ''}${formatNumber(n)} kg`

export function formatSignedKg(n: number): string {
  const r = round2(n)
  if (r === 0) return '0 kg'
  return `${r > 0 ? '+' : '-'}${formatNumber(r)} kg`
}

/** Accepts comma or point, 0 to 999,99 with at most 2 decimals; anything else is null. */
export function parseKg(raw: string): number | null {
  const s = raw.trim().replace(',', '.')
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null
  const n = Number(s)
  return n <= 999.99 ? n : null
}

export function groupDeltaCopy(group: MuscleGroup, deltaKg: number | null, previousMonthName: string): string {
  if (deltaKg === null) return `Sin comparación con ${previousMonthName}`
  if (deltaKg === 0) return `Igual que ${previousMonthName} en ${GROUP_LOWER[group]}`
  return `${deltaKg > 0 ? 'Subiste' : 'Bajaste'} ${formatKg(Math.abs(deltaKg))} en ${GROUP_LOWER[group]}`
}

export type TodayLog =
  | { kind: 'reading'; pages: number; bookTitle: string }
  | { kind: 'workout'; dayTypes: DayType[]; exerciseCount: number }
  | { kind: 'time'; minutes: number; topic: string | null }
  | {
      kind: 'watch'
      title: string
      mediaKind: MediaKind
      episodes: number | null
      minutes: number | null
      completed: boolean
    }
  | { kind: 'quantity'; total: number; config: QuantityConfig; done: boolean }
  | { kind: 'cardio'; entries: { distanceM: number; durationS: number; kind: CardioKind }[] }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * One book progress format everywhere: "página 40 de 412 · 10 %", "página 40" (no total),
 * "412 páginas" (nothing read yet). Never rounds up to 100 % before the last page.
 */
export function bookProgress(page: number | null, total: number | null): string | null {
  if (total !== null && !(total > 0)) total = null
  if (page !== null && page > 0) {
    if (total === null) return `página ${page}`
    const pct = page >= total ? 100 : Math.min(99, Math.round((page / total) * 100))
    return `página ${page} de ${total} · ${pct} %`
  }
  return total === null ? null : `${total} páginas`
}

/** The subtitle of a habit row in Hoy: "26 páginas · Dune", "Pierna y core · 5 ejercicios". */
export function logSubtitle(log: TodayLog): string {
  switch (log.kind) {
    case 'reading':
      return `${pagesLabel(log.pages)} · ${log.bookTitle}`
    case 'time':
      return log.topic ? `${formatDuration(log.minutes)} · ${log.topic}` : formatDuration(log.minutes)
    case 'watch': {
      if (log.mediaKind === 'series' && log.episodes !== null) {
        return `${plural(log.episodes, 'episodio', 'episodios')} · ${log.title}`
      }
      if (log.completed) return `Completa · ${log.title}`
      if (log.minutes !== null) return `${formatDuration(log.minutes)} · ${log.title}`
      return log.title
    }
    case 'quantity': {
      const progress = progressLabel(log.total, log.config)
      return log.done ? `Meta de hoy cumplida · ${progress}` : progress
    }
    case 'cardio':
      return cardioSummary(log.entries)
    case 'workout':
      break
  }
  const names = log.dayTypes.map((t, i) => (i === 0 ? DAY_TYPE_LABEL[t] : DAY_TYPE_LABEL[t].toLocaleLowerCase('es')))
  const types = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0]
  return log.exerciseCount > 0 ? `${types} · ${plural(log.exerciseCount, 'ejercicio', 'ejercicios')}` : types
}
