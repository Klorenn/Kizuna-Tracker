import { describe, expect, it } from 'vitest'
import {
  DAY_TYPES,
  DAY_TYPE_LABEL,
  LOG_TYPES,
  MUSCLE_GROUPS,
  bestByExercise,
  exerciseProgress,
  formatKg,
  formatSignedKg,
  groupDeltaCopy,
  groupDeltaSeries,
  groupDeltas,
  gymVisits,
  headlineGroup,
  lastMonths,
  logSubtitle,
  monthlyReading,
  nextFromPage,
  pagesRead,
  parseKg,
  prefillFromLast,
  readingSeries,
  toSetsPayload,
  validateBook,
  validateReadingInput,
  validateWorkoutDraft,
  visitSeries,
  volumeSeries,
  type Book,
  type ExerciseRef,
  type ReadingEntry,
  type WorkoutDraft,
  type WorkoutSet,
} from '@/domain/logs'

const books: Book[] = [
  { id: 'b1', title: 'Dune', author: null, totalPages: 412, status: 'reading', finishedOn: null },
  { id: 'b2', title: 'Rayuela', author: null, totalPages: 600, status: 'finished', finishedOn: '2026-11-20' },
  { id: 'b3', title: 'Ficciones', author: null, totalPages: 200, status: 'finished', finishedOn: '2026-10-31' },
  { id: 'b4', title: 'Pedro Páramo', author: null, totalPages: 130, status: 'finished', finishedOn: '2026-11-02' },
]
const entries: ReadingEntry[] = [
  { date: '2026-11-03', bookId: 'b1', fromPage: 14, toPage: 40 },
  { date: '2026-11-04', bookId: 'b1', fromPage: 40, toPage: 75 },
  { date: '2026-11-20', bookId: 'b2', fromPage: 580, toPage: 600 },
  { date: '2026-10-30', bookId: 'b3', fromPage: 150, toPage: 200 },
]

describe('constants', () => {
  it('lists log types, day types and muscle groups in order', () => {
    expect(LOG_TYPES).toEqual(['none', 'reading', 'workout'])
    expect(DAY_TYPES).toEqual(['legs', 'chest', 'back', 'shoulders', 'arms', 'core', 'cardio', 'full_body'])
    expect(MUSCLE_GROUPS).toEqual(['legs', 'chest', 'back', 'shoulders', 'arms', 'core'])
    expect(DAY_TYPES.map((d) => DAY_TYPE_LABEL[d])).toEqual([
      'Pierna',
      'Pecho',
      'Espalda',
      'Hombros',
      'Brazos',
      'Core',
      'Cardio',
      'Cuerpo completo',
    ])
  })
})

describe('reading', () => {
  it('counts pages and monthly reading', () => {
    expect(pagesRead({ fromPage: 14, toPage: 40 })).toBe(26)
    expect(monthlyReading(entries, books, '2026-11')).toEqual({
      month: '2026-11',
      pages: 81,
      days: 3,
      booksFinished: [
        { id: 'b4', title: 'Pedro Páramo' },
        { id: 'b2', title: 'Rayuela' },
      ],
    })
    expect(monthlyReading(entries, books, '2026-10')).toEqual({
      month: '2026-10',
      pages: 50,
      days: 1,
      booksFinished: [{ id: 'b3', title: 'Ficciones' }],
    })
  })

  it('builds month lists and series', () => {
    expect(lastMonths('2026-11', 3)).toEqual(['2026-09', '2026-10', '2026-11'])
    expect(lastMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
    expect(readingSeries(entries, books, lastMonths('2026-11', 3))).toEqual([
      { month: '2026-09', pages: 0, books: 0 },
      { month: '2026-10', pages: 50, books: 1 },
      { month: '2026-11', pages: 81, books: 2 },
    ])
  })

  it('suggests where to continue', () => {
    expect(nextFromPage(entries, 'b1')).toBe(75)
    expect(nextFromPage(entries, 'b9')).toBe(0)
  })

  it('validates the pages', () => {
    expect(validateReadingInput({ fromPage: 40, toPage: 14, totalPages: null })).toEqual({
      ok: false,
      error: 'La página final no puede ser menor que la inicial.',
    })
    expect(validateReadingInput({ fromPage: -1, toPage: 3, totalPages: null })).toEqual({
      ok: false,
      error: 'Las páginas empiezan en 0.',
    })
    expect(validateReadingInput({ fromPage: 14, toPage: 413, totalPages: 412 })).toEqual({
      ok: false,
      error: 'El libro tiene 412 páginas.',
    })
    expect(validateReadingInput({ fromPage: 1.5, toPage: 3, totalPages: null })).toEqual({
      ok: false,
      error: 'Usa números enteros.',
    })
    expect(validateReadingInput({ fromPage: 14, toPage: 14, totalPages: null })).toEqual({ ok: true })
  })

  it('validates a book', () => {
    expect(validateBook({ title: ' ', author: null, totalPages: null }).ok).toBe(false)
    expect(validateBook({ title: 'Dune', author: null, totalPages: 0 }).ok).toBe(false)
    expect(validateBook({ title: 'Dune', author: 'Frank Herbert', totalPages: 412 })).toEqual({ ok: true })
  })
})

const ex: ExerciseRef[] = [
  { id: 'sq', name: 'Sentadilla', group: 'legs' },
  { id: 'lp', name: 'Prensa', group: 'legs' },
  { id: 'rdl', name: 'Peso muerto rumano', group: 'legs' },
  { id: 'ext', name: 'Extensión de cuádriceps', group: 'legs' },
  { id: 'bp', name: 'Press banca', group: 'chest' },
  { id: 'pu', name: 'Flexiones', group: 'chest' },
]
const s = (sessionId: string, date: string, exerciseId: string, reps: number, kg: number): WorkoutSet => ({
  sessionId,
  date,
  exerciseId,
  reps,
  kg,
})
const sets = [
  s('s1', '2026-10-06', 'sq', 8, 55),
  s('s1', '2026-10-06', 'sq', 8, 60),
  s('s1', '2026-10-06', 'lp', 10, 100),
  s('s1', '2026-10-06', 'rdl', 10, 50),
  s('s2', '2026-10-20', 'sq', 8, 57.5),
  s('s2', '2026-10-20', 'bp', 8, 40),
  s('s3', '2026-11-03', 'sq', 5, 75),
  s('s3', '2026-11-03', 'lp', 10, 110),
  s('s3', '2026-11-03', 'bp', 8, 42.5),
  s('s3', '2026-11-03', 'pu', 15, 0),
  s('s4', '2026-11-17', 'sq', 5, 80),
  s('s4', '2026-11-17', 'sq', 5, 80),
  s('s4', '2026-11-17', 'lp', 10, 120),
  s('s4', '2026-11-17', 'ext', 12, 30),
]

describe('workout stats', () => {
  it('finds the best kg per exercise', () => {
    expect(Object.fromEntries(bestByExercise(sets, '2026-11'))).toEqual({ sq: 80, lp: 120, bp: 42.5, pu: 0, ext: 30 })
  })

  it('compares each muscle group with the previous month', () => {
    expect(groupDeltas(sets, ex, '2026-11')).toEqual([
      {
        group: 'legs',
        deltaKg: 40,
        volumeKg: 3835,
        exercises: [
          { exerciseId: 'lp', name: 'Prensa', previousKg: 100, currentKg: 120, deltaKg: 20 },
          { exerciseId: 'sq', name: 'Sentadilla', previousKg: 60, currentKg: 80, deltaKg: 20 },
          { exerciseId: 'ext', name: 'Extensión de cuádriceps', previousKg: null, currentKg: 30, deltaKg: null },
        ],
      },
      {
        group: 'chest',
        deltaKg: 2.5,
        volumeKg: 340,
        exercises: [
          { exerciseId: 'bp', name: 'Press banca', previousKg: 40, currentKg: 42.5, deltaKg: 2.5 },
          { exerciseId: 'pu', name: 'Flexiones', previousKg: null, currentKg: 0, deltaKg: null },
        ],
      },
    ])
  })

  it('picks the headline group and the series', () => {
    expect(headlineGroup(sets, ex, '2026-11')).toEqual({ group: 'legs', deltaKg: 40 })
    expect(headlineGroup(sets, ex, '2026-01')).toBeNull()
    expect(groupDeltaSeries(sets, ex, 'legs', ['2026-10', '2026-11'])).toEqual([
      { month: '2026-10', deltaKg: null },
      { month: '2026-11', deltaKg: 40 },
    ])
    expect(volumeSeries(sets, ex, ['2026-10', '2026-11'])).toEqual([
      { month: '2026-10', kg: 3200 },
      { month: '2026-11', kg: 4175 },
    ])
    expect(volumeSeries(sets, ex, ['2026-10', '2026-11'], 'legs')).toEqual([
      { month: '2026-10', kg: 2880 },
      { month: '2026-11', kg: 3835 },
    ])
    expect(exerciseProgress(sets, 'sq')).toEqual([
      { date: '2026-10-06', bestKg: 60 },
      { date: '2026-10-20', bestKg: 57.5 },
      { date: '2026-11-03', bestKg: 75 },
      { date: '2026-11-17', bestKg: 80 },
    ])
  })

  it('counts gym visits by distinct day', () => {
    expect(gymVisits(['2026-11-03', '2026-11-17', '2026-11-17', '2026-10-20'], '2026-11')).toBe(2)
    expect(visitSeries(['2026-11-03', '2026-11-17', '2026-10-20'], ['2026-10', '2026-11'])).toEqual([
      { month: '2026-10', count: 1 },
      { month: '2026-11', count: 2 },
    ])
  })
})

describe('kg formatting and copy', () => {
  it('formats kg with Spanish separators', () => {
    expect(formatKg(42.5)).toBe('42,5 kg')
    expect(formatKg(40)).toBe('40 kg')
    expect(formatKg(3835)).toBe('3.835 kg')
    expect(formatSignedKg(40)).toBe('+40 kg')
    expect(formatSignedKg(-2.5)).toBe('-2,5 kg')
    expect(formatSignedKg(0)).toBe('0 kg')
  })

  it('parses kg with comma or point', () => {
    expect(parseKg('42,5')).toBe(42.5)
    expect(parseKg('42.5')).toBe(42.5)
    expect(parseKg('0')).toBe(0)
    for (const bad of ['', '-1', '1000', '42,555', 'abc']) expect(parseKg(bad)).toBeNull()
  })

  it('writes the group delta copy', () => {
    expect(groupDeltaCopy('legs', 40, 'octubre')).toBe('Subiste 40 kg en pierna')
    expect(groupDeltaCopy('chest', 2.5, 'octubre')).toBe('Subiste 2,5 kg en pecho')
    expect(groupDeltaCopy('legs', -5, 'octubre')).toBe('Bajaste 5 kg en pierna')
    expect(groupDeltaCopy('legs', 0, 'octubre')).toBe('Igual que octubre en pierna')
    expect(groupDeltaCopy('legs', null, 'octubre')).toBe('Sin comparación con octubre')
  })
})

describe('workout draft', () => {
  const draft: WorkoutDraft = {
    dayTypes: ['legs'],
    exercises: [{ exerciseId: 'sq', sets: [{ reps: 5, kg: 80 }, { reps: 5, kg: 82.5 }] }],
  }

  it('validates the draft', () => {
    expect(validateWorkoutDraft(draft)).toEqual({ ok: true })
    expect(validateWorkoutDraft({ ...draft, dayTypes: [] })).toEqual({
      ok: false,
      error: 'Elige al menos un tipo de día.',
    })
    expect(validateWorkoutDraft({ dayTypes: ['legs'], exercises: [{ exerciseId: 'sq', sets: [] }] })).toEqual({
      ok: false,
      error: 'Agrega al menos una serie a cada ejercicio.',
    })
    expect(
      validateWorkoutDraft({ dayTypes: ['legs'], exercises: [{ exerciseId: 'sq', sets: [{ reps: 0, kg: 80 }] }] }),
    ).toEqual({ ok: false, error: 'Las repeticiones van de 1 a 1000.' })
    expect(
      validateWorkoutDraft({ dayTypes: ['legs'], exercises: [{ exerciseId: 'sq', sets: [{ reps: 5, kg: 1000 }] }] }),
    ).toEqual({ ok: false, error: 'El peso va de 0 a 999,99 kg.' })
    expect(validateWorkoutDraft({ dayTypes: ['legs'], exercises: [draft.exercises[0], draft.exercises[0]] })).toEqual({
      ok: false,
      error: 'Ese ejercicio ya está en la lista.',
    })
    expect(
      validateWorkoutDraft({
        dayTypes: ['legs'],
        exercises: [{ exerciseId: 'sq', sets: Array(11).fill({ reps: 5, kg: 80 }) }],
      }),
    ).toEqual({ ok: false, error: 'Puedes registrar hasta 10 series por ejercicio.' })
    expect(
      validateWorkoutDraft({
        dayTypes: ['legs'],
        exercises: Array.from({ length: 21 }, (_, i) => ({ exerciseId: `e${i}`, sets: [{ reps: 5, kg: 10 }] })),
      }),
    ).toEqual({ ok: false, error: 'Puedes registrar hasta 20 ejercicios.' })
    expect(validateWorkoutDraft({ dayTypes: ['cardio'], exercises: [] })).toEqual({ ok: true })
  })

  it('rejects kg with more than two decimals and repeated day types', () => {
    expect(
      validateWorkoutDraft({ dayTypes: ['legs'], exercises: [{ exerciseId: 'sq', sets: [{ reps: 5, kg: 42.555 }] }] }).ok,
    ).toBe(false)
    expect(validateWorkoutDraft({ dayTypes: ['legs', 'legs'], exercises: [] }).ok).toBe(false)
  })

  it('builds the RPC payload in order', () => {
    expect(toSetsPayload(draft)).toEqual([
      { exercise_id: 'sq', reps: 5, kg: 80 },
      { exercise_id: 'sq', reps: 5, kg: 82.5 },
    ])
  })

  it('pre-fills from the last workout of the same type', () => {
    const past = [
      { date: '2026-11-17', dayTypes: ['legs', 'core'], exercises: [{ exerciseId: 'sq', sets: [{ reps: 5, kg: 80 }] }] },
      { date: '2026-11-10', dayTypes: ['legs'], exercises: [{ exerciseId: 'lp', sets: [{ reps: 10, kg: 120 }] }] },
      { date: '2026-11-22', dayTypes: ['legs'], exercises: [{ exerciseId: 'ext', sets: [{ reps: 12, kg: 30 }] }] },
    ] as ({ date: string } & WorkoutDraft)[]
    expect(prefillFromLast(past, ['legs'], '2026-11-22')).toEqual({
      dayTypes: ['legs'],
      exercises: [{ exerciseId: 'lp', sets: [{ reps: 10, kg: 120 }] }],
    })
    expect(prefillFromLast(past, ['core', 'legs'], '2026-11-22')?.exercises[0].exerciseId).toBe('sq')
    expect(prefillFromLast(past, ['legs', 'arms'], '2026-11-22')).toEqual({
      dayTypes: ['legs', 'arms'],
      exercises: [{ exerciseId: 'sq', sets: [{ reps: 5, kg: 80 }] }],
    })
    expect(prefillFromLast(past, ['cardio'], '2026-11-22')).toBeNull()
  })
})

describe('logSubtitle', () => {
  it('describes a reading', () => {
    expect(logSubtitle({ kind: 'reading', pages: 26, bookTitle: 'Dune' })).toBe('26 páginas · Dune')
    expect(logSubtitle({ kind: 'reading', pages: 1, bookTitle: 'Dune' })).toBe('1 página · Dune')
  })

  it('describes a workout', () => {
    expect(logSubtitle({ kind: 'workout', dayTypes: ['legs'], exerciseCount: 5 })).toBe('Pierna · 5 ejercicios')
    expect(logSubtitle({ kind: 'workout', dayTypes: ['legs', 'core'], exerciseCount: 1 })).toBe(
      'Pierna y core · 1 ejercicio',
    )
    expect(logSubtitle({ kind: 'workout', dayTypes: ['chest', 'shoulders', 'arms'], exerciseCount: 3 })).toBe(
      'Pecho, hombros y brazos · 3 ejercicios',
    )
    expect(logSubtitle({ kind: 'workout', dayTypes: ['cardio'], exerciseCount: 0 })).toBe('Cardio')
  })
})
