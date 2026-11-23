import { describe, expect, test } from 'vitest'
import type { Book, ExerciseRef, ReadingEntry, WorkoutSet } from '@/domain/logs'
import { buildLogCards } from '@/lib/log-cards'

const books: Book[] = [
  { id: 'dune', title: 'Dune', author: null, totalPages: 412, status: 'reading', finishedOn: null },
  { id: 'viento', title: 'El nombre del viento', author: null, totalPages: 662, status: 'finished', finishedOn: '2026-10-18' },
]
const entries: ReadingEntry[] = [
  { date: '2026-10-04', bookId: 'viento', fromPage: 0, toPage: 30 },
  { date: '2026-10-11', bookId: 'viento', fromPage: 30, toPage: 50 },
  { date: '2026-11-22', bookId: 'dune', fromPage: 14, toPage: 40 },
]
const exercises: ExerciseRef[] = [
  { id: 'squat', name: 'Sentadilla', group: 'legs' },
  { id: 'press', name: 'Prensa', group: 'legs' },
  { id: 'ext', name: 'Extensión de cuádriceps', group: 'legs' },
]
const set = (date: string, exerciseId: string, reps: number, kg: number): WorkoutSet => ({
  sessionId: date,
  date,
  exerciseId,
  reps,
  kg,
})
const sets: WorkoutSet[] = [
  set('2026-10-04', 'squat', 8, 60),
  set('2026-10-04', 'press', 10, 100),
  set('2026-11-22', 'squat', 5, 80),
  set('2026-11-22', 'press', 10, 120),
  set('2026-11-22', 'ext', 12, 30),
]

describe('buildLogCards', () => {
  test('lectura, gimnasio y peso con el mes anterior en pequeño', () => {
    const cards = buildLogCards({
      month: '2026-11',
      reading: { books, entries },
      workout: { exercises, sets },
      visits: ['2026-10-04', '2026-11-19', '2026-11-22'],
      weights: [
        { date: '2026-10-28', kg: 72.4 },
        { date: '2026-11-05', kg: 71.9 },
        { date: '2026-11-20', kg: 71.2 },
      ],
    })
    expect(cards.map((c) => [c.key, c.label, c.value, c.caption, c.href])).toEqual([
      ['books', 'Libros terminados', '0', 'Octubre: 1', '/resumen/lectura'],
      ['pages', 'Páginas', '26', 'Octubre: 50', '/resumen/lectura'],
      ['visits', 'Visitas al gym', '2', 'Octubre: 1', '/resumen/gimnasio'],
      ['group', 'Pierna', '+40 kg', 'Octubre: sin comparación', '/resumen/gimnasio/legs'],
      ['weight', 'Peso', '71,2 kg', 'Este mes: −1,2 kg', '/resumen/peso'],
    ])
    expect(cards.find((c) => c.key === 'weight')?.private).toBe(true)
  })

  test('sin hábitos con registro ni pesos no hay tarjetas', () => {
    expect(buildLogCards({ month: '2026-11', reading: null, workout: null, visits: null, weights: [] })).toEqual([])
  })

  test('sin entrenamientos en el mes la tarjeta de grupo lleva a la vista de gimnasio', () => {
    const cards = buildLogCards({ month: '2026-12', reading: null, workout: { exercises, sets }, visits: [], weights: [] })
    expect(cards.find((c) => c.key === 'group')).toMatchObject({
      label: 'Kg por grupo',
      value: '—',
      href: '/resumen/gimnasio',
    })
  })
})
