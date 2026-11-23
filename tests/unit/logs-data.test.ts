import { describe, expect, test } from 'vitest'
import type { Book, ExerciseRef } from '@/domain/logs'
import {
  loadLatestWeight,
  loadMonthLogs,
  loadVisitDates,
  loadWeights,
  loadWorkoutData,
  logWindowStart,
  toDayLogs,
  type ReadingRow,
  type SessionRow,
  type SetRow,
} from '@/lib/logs-data'

type Row = Record<string, unknown>

/**
 * In-memory PostgREST stand-in: applies eq / in / is / gte / lte filters and range(), caps
 * every answer at 1000 rows like max_rows, and records the ranges asked per table.
 */
function fakeClient(tables: Record<string, Row[]>) {
  const ranges: Record<string, [number, number][]> = {}
  const client = {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = []
      const sorts: { col: string; asc: boolean }[] = []
      const q = {
        select: () => q,
        or: () => q,
        order: (col: string, opts?: { ascending?: boolean }) => (sorts.push({ col, asc: opts?.ascending !== false }), q),
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
        in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
        is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
        gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), q),
        lte: (c: string, v: string) => (filters.push((r) => String(r[c]) <= v), q),
        range: async (from: number, to: number) => {
          ;(ranges[table] ??= []).push([from, to])
          const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
          const first = sorts[0]
          if (first && !first.asc) rows.sort((a, b) => String(b[first.col]).localeCompare(String(a[first.col])))
          return { data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null }
        },
      }
      return q
    },
  }
  return { client, ranges }
}

describe('logWindowStart', () => {
  test('primer día del mes, doce meses atrás', () => {
    expect(logWindowStart('2026-11-22')).toBe('2025-11-01')
    expect(logWindowStart('2026-01-05')).toBe('2025-01-01')
  })
})

describe('toDayLogs', () => {
  const books: Book[] = [
    { id: 'b1', title: 'Dune', author: null, totalPages: 412, status: 'finished', finishedOn: '2026-11-22' },
  ]
  const exercises: ExerciseRef[] = [
    { id: 'squat', name: 'Sentadilla', group: 'legs' },
    { id: 'press', name: 'Prensa', group: 'legs' },
  ]

  test('lectura: libro, páginas y libro terminado ese día', () => {
    const reading: ReadingRow[] = [
      { checkin_id: 'c1', book_id: 'b1', local_date: '2026-11-22', from_page: 14, to_page: 40 },
    ]
    const logs = toDayLogs({ reading, sessions: [], sets: [], books, exercises })
    expect(logs).toEqual(
      new Map([
        ['c1', { kind: 'reading', bookTitle: 'Dune', fromPage: 14, toPage: 40, pages: 26, finishedBook: true }],
      ]),
    )
  })

  test('lectura de un libro terminado otro día no lo marca terminado', () => {
    const reading: ReadingRow[] = [
      { checkin_id: 'c1', book_id: 'b1', local_date: '2026-11-20', from_page: 0, to_page: 14 },
    ]
    const log = toDayLogs({ reading, sessions: [], sets: [], books, exercises }).get('c1')
    expect(log).toMatchObject({ finishedBook: false, pages: 14 })
  })

  test('entrenamiento: series por ejercicio en orden de position, mejor kg y volumen', () => {
    const sessions: SessionRow[] = [{ id: 's1', checkin_id: 'c2', local_date: '2026-11-22', day_types: ['legs'] }]
    const sets: SetRow[] = [
      { session_id: 's1', exercise_id: 'press', position: 2, reps: 10, weight_kg: 120, local_date: '2026-11-22' },
      { session_id: 's1', exercise_id: 'squat', position: 1, reps: 5, weight_kg: '80.00', local_date: '2026-11-22' },
      { session_id: 's1', exercise_id: 'squat', position: 0, reps: 5, weight_kg: 75, local_date: '2026-11-22' },
    ]
    expect(toDayLogs({ reading: [], sessions, sets, books, exercises }).get('c2')).toEqual({
      kind: 'workout',
      dayTypes: ['legs'],
      exercises: [
        { name: 'Sentadilla', sets: [{ reps: 5, kg: 75 }, { reps: 5, kg: 80 }], bestKg: 80 },
        { name: 'Prensa', sets: [{ reps: 10, kg: 120 }], bestKg: 120 },
      ],
      volumeKg: 1975,
    })
  })
})

describe('loaders', () => {
  test('loadWorkoutData lee más allá de 1000 series, página por página', async () => {
    const sets = Array.from({ length: 1003 }, (_, i) => ({
      id: `set${String(i).padStart(5, '0')}`,
      session_id: 's1',
      user_id: 'u1',
      local_date: '2026-11-22',
      exercise_id: 'squat',
      position: i % 200,
      reps: 5,
      weight_kg: '80.00',
    }))
    const { client, ranges } = fakeClient({
      workout_sets: sets,
      workout_sessions: [{ id: 's1', checkin_id: 'c1', user_id: 'u1', local_date: '2026-11-22', day_types: ['legs'] }],
      exercises: [{ id: 'squat', user_id: null, name: 'Sentadilla', muscle_group: 'legs', archived_at: null }],
    })
    const data = await loadWorkoutData(client as never, 'u1', '2025-11-01')
    expect(data.sets).toHaveLength(1003)
    expect(data.sets[0]).toEqual({ sessionId: 's1', date: '2026-11-22', exerciseId: 'squat', reps: 5, kg: 80 })
    expect(ranges.workout_sets).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(data.exercises).toEqual([{ id: 'squat', name: 'Sentadilla', group: 'legs' }])
    expect(data.sessions).toHaveLength(1)
    expect(data.sessions[0].dayTypes).toEqual(['legs'])
  })

  test('loadWorkoutData incluye ejercicios archivados y propios', async () => {
    const { client } = fakeClient({
      workout_sets: [
        { id: 'x1', session_id: 's1', user_id: 'u1', local_date: '2026-11-22', exercise_id: 'squat', position: 0, reps: 5, weight_kg: 80 },
      ],
      workout_sessions: [],
      exercises: [
        { id: 'squat', user_id: null, name: 'Sentadilla', muscle_group: 'legs', archived_at: null },
        { id: 'mine', user_id: 'u1', name: 'Hip thrust', muscle_group: 'legs', archived_at: '2026-10-01T00:00:00Z' },
      ],
    })
    const data = await loadWorkoutData(client as never, 'u1', '2025-11-01')
    expect(data.exercises.map((e) => e.id)).toEqual(['squat', 'mine'])
  })

  test('loadVisitDates: sin rechazados ni hábitos que no son de entrenamiento; con archivados', async () => {
    const { client } = fakeClient({
      habits: [
        { id: 'gym', user_id: 'u1', log_type: 'workout', archived_at: null },
        { id: 'old', user_id: 'u1', log_type: 'workout', archived_at: '2026-01-01T00:00:00Z' },
        { id: 'read', user_id: 'u1', log_type: 'none', archived_at: null },
      ],
      checkins: [
        { id: 'k1', user_id: 'u1', habit_id: 'gym', local_date: '2026-11-20', rejected_at: null },
        { id: 'k2', user_id: 'u1', habit_id: 'gym', local_date: '2026-11-21', rejected_at: '2026-11-21T10:00:00Z' },
        { id: 'k3', user_id: 'u1', habit_id: 'read', local_date: '2026-11-19', rejected_at: null },
        { id: 'k4', user_id: 'u1', habit_id: 'old', local_date: '2026-11-02', rejected_at: null },
        { id: 'k5', user_id: 'u1', habit_id: 'gym', local_date: '2025-01-02', rejected_at: null },
      ],
    })
    await expect(loadVisitDates(client as never, 'u1', '2025-11-01')).resolves.toEqual(['2026-11-02', '2026-11-20'])
  })

  test('loadWeights convierte numeric a número', async () => {
    const { client } = fakeClient({
      body_weights: [
        { id: 'w1', user_id: 'u1', measured_on: '2026-11-20', weight_kg: '71.90' },
        { id: 'w2', user_id: 'u1', measured_on: '2026-10-01', weight_kg: 72.4 },
      ],
    })
    await expect(loadWeights(client as never, 'u1', '2026-01-01')).resolves.toEqual([
      { date: '2026-11-20', kg: 71.9 },
      { date: '2026-10-01', kg: 72.4 },
    ])
  })
})

describe('loaders sin consultas de más', () => {
  const tables = {
    reading_entries: [],
    workout_sessions: [],
    workout_sets: [],
    books: [{ id: 'b1', user_id: 'u1', title: 'Dune', author: null, total_pages: 412, status: 'reading', finished_on: null }],
    exercises: [{ id: 'squat', user_id: null, name: 'Sentadilla', muscle_group: 'legs' }],
  }
  const range = { first: '2026-11-01', until: '2026-11-22' }

  test('loadMonthLogs sin hábitos de lectura ni entrenamiento no consulta nada', async () => {
    const { client, ranges } = fakeClient(tables)
    const logs = await loadMonthLogs(client as never, 'u1', range, { reading: false, workout: false })
    expect(logs.size).toBe(0)
    expect(Object.keys(ranges)).toEqual([])
  })

  test('loadMonthLogs: solo lectura, y sin entradas no carga libros', async () => {
    const { client, ranges } = fakeClient(tables)
    await loadMonthLogs(client as never, 'u1', range, { reading: true, workout: false })
    expect(Object.keys(ranges)).toEqual(['reading_entries'])
  })

  test('loadMonthLogs: sin sesiones no carga series ni ejercicios', async () => {
    const { client, ranges } = fakeClient(tables)
    await loadMonthLogs(client as never, 'u1', range, { reading: false, workout: true })
    expect(Object.keys(ranges)).toEqual(['workout_sessions'])
  })

  test('loadMonthLogs: con una entrada trae solo ese libro', async () => {
    const { client, ranges } = fakeClient({
      ...tables,
      reading_entries: [
        { id: 'r1', checkin_id: 'c1', user_id: 'u1', book_id: 'b1', local_date: '2026-11-03', from_page: 1, to_page: 9 },
      ],
      books: [
        ...tables.books,
        { id: 'b2', user_id: 'u1', title: 'Otro', author: null, total_pages: null, status: 'reading', finished_on: null },
      ],
    })
    const logs = await loadMonthLogs(client as never, 'u1', range, { reading: true, workout: false })
    expect(logs.get('c1')).toMatchObject({ kind: 'reading', bookTitle: 'Dune', pages: 8 })
    expect(ranges.books).toHaveLength(1)
  })

  test('loadWorkoutData sin series no carga el catálogo de ejercicios', async () => {
    const { client, ranges } = fakeClient(tables)
    const data = await loadWorkoutData(client as never, 'u1', '2025-11-01')
    expect(data.exercises).toEqual([])
    expect(ranges.exercises).toBeUndefined()
  })

  test('loadWorkoutData con exercises:false no los carga aunque haya series', async () => {
    const { client, ranges } = fakeClient({
      ...tables,
      workout_sets: [
        { id: 'x1', session_id: 's1', user_id: 'u1', local_date: '2026-11-22', exercise_id: 'squat', position: 0, reps: 5, weight_kg: 80 },
      ],
    })
    const data = await loadWorkoutData(client as never, 'u1', '2025-11-01', { exercises: false })
    expect(data.sets).toHaveLength(1)
    expect(ranges.exercises).toBeUndefined()
  })

  test('loadLatestWeight: el último pesaje aunque sea anterior a la ventana', async () => {
    const { client } = fakeClient({
      body_weights: [
        { id: 'w1', user_id: 'u1', measured_on: '2024-05-01', weight_kg: '80.00' },
        { id: 'w2', user_id: 'u1', measured_on: '2024-06-10', weight_kg: '79.50' },
      ],
    })
    await expect(loadLatestWeight(client as never, 'u1')).resolves.toEqual({ date: '2024-06-10', kg: 79.5 })
  })
})
