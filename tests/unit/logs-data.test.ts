import { describe, expect, test } from 'vitest'
import type { Book, ExerciseRef } from '@/domain/logs'
import type { QuantityConfig } from '@/domain/quantity'
import type { MediaItem } from '@/domain/watch'
import { loadMonthDays } from '@/lib/calendar-data'
import { fakeSupabase } from './support/fake-supabase'
import {
  loadCardioData,
  loadLatestWeight,
  loadMonthLogs,
  loadQuantityData,
  loadTimeData,
  loadWatchData,
  quantityConfigOf,
  timeLine,
  toQuantityDayLogs,
  watchLine,
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
        ['c1', { kind: 'reading', bookTitle: 'Dune', fromPage: 14, toPage: 40, pages: 26, finishedBook: true, totalPages: 412 }],
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

describe('toDayLogs: tiempo, series, cantidad y distancia', () => {
  const base = { reading: [], sessions: [], sets: [], books: [], exercises: [] }
  const dune: MediaItem = {
    id: 'm1', title: 'Dune', kind: 'movie', totalSeasons: null, totalEpisodes: null, runtimeMin: 155, status: 'finished', finishedOn: '2026-11-02',
  }
  const dark: MediaItem = {
    id: 'm2', title: 'Dark', kind: 'series', totalSeasons: 3, totalEpisodes: 26, runtimeMin: null, status: 'watching', finishedOn: null,
  }

  test('tiempo: minutos, tema y pomodoros del check-in', () => {
    const logs = toDayLogs({ ...base, time: [{ checkin_id: 'c1', minutes: 85, topic: 'Álgebra', pomodoros: 4 }] })
    expect(logs).toEqual(new Map([['c1', { kind: 'time', minutes: 85, topic: 'Álgebra', pomodoros: 4 }]]))
  })

  test('película completa sin minutos cuenta su duración', () => {
    const logs = toDayLogs({
      ...base,
      media: [dune],
      watch: [{ checkin_id: 'c2', media_id: 'm1', local_date: '2026-11-02', episodes: null, season: null, episode_to: null, minutes: null, completed: true }],
    })
    expect(logs.get('c2')).toEqual({
      kind: 'watch', title: 'Dune', mediaKind: 'movie', episodes: null, season: null, episodeTo: null, minutes: 155, completed: true,
    })
  })

  test('serie: episodios y temporada, sin minutos estimados', () => {
    const logs = toDayLogs({
      ...base,
      media: [dark],
      watch: [{ checkin_id: 'c3', media_id: 'm2', local_date: '2026-11-03', episodes: 3, season: 1, episode_to: 6, minutes: null, completed: false }],
    })
    expect(logs.get('c3')).toMatchObject({ kind: 'watch', title: 'Dark', mediaKind: 'series', episodes: 3, season: 1, episodeTo: 6, minutes: 0, completed: false })
  })

  test('dos salidas del mismo check-in: un solo registro, en orden de creación', () => {
    const logs = toDayLogs({
      ...base,
      cardio: [
        { id: 'k2', checkin_id: 'c4', kind: 'run', distance_m: 3000, duration_s: 1000, created_at: '2026-11-04T13:00:00Z' },
        { id: 'k1', checkin_id: 'c4', kind: 'run', distance_m: 5000, duration_s: 1800, created_at: '2026-11-04T11:00:00Z' },
      ],
    })
    expect(logs.size).toBe(1)
    expect(logs.get('c4')).toEqual({
      kind: 'cardio',
      entries: [
        { id: 'k1', kind: 'run', distanceM: 5000, durationS: 1800 },
        { id: 'k2', kind: 'run', distanceM: 3000, durationS: 1000 },
      ],
    })
  })
})

describe('toQuantityDayLogs', () => {
  const config: QuantityConfig = { unit: 'ml', label: null, target: 2000, step: 250, display: 'glasses', glassMl: 250 }
  test('sumas con la hora en la zona del perfil y el total, por hábito y día', () => {
    const logs = toQuantityDayLogs({
      habits: [{ id: 'h1', config }],
      timezone: 'America/Santiago',
      rows: [
        { id: 'q2', habit_id: 'h1', local_date: '2026-11-22', amount: '250.00', created_at: '2026-11-22T13:05:00Z' },
        { id: 'q1', habit_id: 'h1', local_date: '2026-11-22', amount: 250, created_at: '2026-11-22T11:10:00Z' },
      ],
    })
    expect(logs.get('h1:2026-11-22')).toEqual({
      kind: 'quantity',
      total: 500,
      target: 2000,
      config,
      entries: [
        { amount: 250, time: '8:10' },
        { amount: 250, time: '10:05' },
      ],
    })
  })

  test('quantityConfigOf lee las columnas del hábito', () => {
    expect(
      quantityConfigOf({
        quantity_unit: 'ml', quantity_label: null, quantity_target: '2000.00', quantity_step: '250.00', quantity_display: 'glasses', glass_ml: 250,
      }),
    ).toEqual(config)
    expect(
      quantityConfigOf({ quantity_unit: null, quantity_label: null, quantity_target: null, quantity_step: null, quantity_display: 'base', glass_ml: 250 }),
    ).toBeNull()
  })
})

describe('timeLine y watchLine', () => {
  test('tiempo: "1 h 25 min · Álgebra · 2 pomodoros"', () => {
    expect(timeLine({ kind: 'time', minutes: 85, topic: 'Álgebra', pomodoros: 2 })).toBe('1 h 25 min · Álgebra · 2 pomodoros')
    expect(timeLine({ kind: 'time', minutes: 45, topic: null, pomodoros: 1 })).toBe('45 min · 1 pomodoro')
    expect(timeLine({ kind: 'time', minutes: 45, topic: null, pomodoros: 0 })).toBe('45 min')
  })
  test('series y películas', () => {
    const w = { kind: 'watch' as const, season: null, episodeTo: null, episodes: null, minutes: 0, completed: false }
    expect(watchLine({ ...w, title: 'Dark', mediaKind: 'series', episodes: 3, season: 1, episodeTo: 6 })).toBe('Dark · 3 episodios · T1 E6')
    expect(watchLine({ ...w, title: 'Dark', mediaKind: 'series', episodes: 1 })).toBe('Dark · 1 episodio')
    expect(watchLine({ ...w, title: 'Dune', mediaKind: 'movie', completed: true, minutes: 155 })).toBe('Dune · Completa · 2 h 35 min')
    expect(watchLine({ ...w, title: 'Past Lives', mediaKind: 'movie', minutes: 70 })).toBe('Past Lives · 1 h 10 min')
  })
})

describe('loaders v4', () => {
  test('loadQuantityData lee más de 1000 sumas, página por página', async () => {
    const rows = Array.from({ length: 1005 }, (_, i) => ({
      id: `q${i}`, user_id: 'u1', habit_id: 'h1', local_date: '2026-11-01', amount: 250, created_at: `2026-11-01T10:00:${String(i % 60).padStart(2, '0')}Z`,
    }))
    const { client, ranges } = fakeClient({ quantity_entries: rows, checkins: [] })
    const data = await loadQuantityData(client as never, 'u1', 'h1', '2025-11-01')
    expect(data.entries).toHaveLength(1005)
    expect(data.doneDates).toEqual([])
    expect(ranges.quantity_entries).toEqual([[0, 999], [1000, 1999]])
  })

  test('loadQuantityData: días cumplidos sin rechazados', async () => {
    const { client } = fakeClient({
      quantity_entries: [{ id: 'q1', user_id: 'u1', habit_id: 'h1', local_date: '2026-11-02', amount: '2000.00', created_at: 'x' }],
      checkins: [
        { id: 'c1', user_id: 'u1', habit_id: 'h1', local_date: '2026-11-02', rejected_at: null },
        { id: 'c2', user_id: 'u1', habit_id: 'h1', local_date: '2026-11-03', rejected_at: '2026-11-03T10:00:00Z' },
      ],
    })
    const data = await loadQuantityData(client as never, 'u1', 'h1', '2025-11-01')
    expect(data.entries).toEqual([{ date: '2026-11-02', amount: 2000 }])
    expect(data.doneDates).toEqual(['2026-11-02'])
  })

  test('loadTimeData, loadWatchData y loadCardioData devuelven el dominio', async () => {
    const { client } = fakeClient({
      time_entries: [{ id: 't1', user_id: 'u1', habit_id: 'h1', local_date: '2026-11-22', minutes: 85, topic: 'Álgebra', pomodoros: 2 }],
      media_items: [{ id: 'm1', user_id: 'u1', title: 'Dune', kind: 'movie', total_seasons: null, total_episodes: null, runtime_min: 155, status: 'finished', finished_on: '2026-11-02' }],
      watch_entries: [{ id: 'w1', user_id: 'u1', media_id: 'm1', local_date: '2026-11-02', episodes: null, season: null, episode_to: null, minutes: null, completed: true }],
      cardio_entries: [{ id: 'k1', user_id: 'u1', local_date: '2026-11-22', kind: 'run', distance_m: 5200, duration_s: 1780 }],
    })
    await expect(loadTimeData(client as never, 'u1', '2025-11-01')).resolves.toEqual([
      { date: '2026-11-22', habitId: 'h1', minutes: 85, topic: 'Álgebra', pomodoros: 2 },
    ])
    const watch = await loadWatchData(client as never, 'u1', '2025-11-01')
    expect(watch.media[0]).toMatchObject({ id: 'm1', kind: 'movie', runtimeMin: 155, finishedOn: '2026-11-02' })
    expect(watch.entries).toEqual([
      { date: '2026-11-02', mediaId: 'm1', episodes: null, season: null, episodeTo: null, minutes: null, completed: true },
    ])
    await expect(loadCardioData(client as never, 'u1', '2025-11-01')).resolves.toEqual([
      { id: 'k1', date: '2026-11-22', kind: 'run', distanceM: 5200, durationS: 1780 },
    ])
  })
})

describe('privacidad: los registros v4 son solo del dueño', () => {
  const day = { userId: 'u1', month: '2026-11', today: '2026-11-22', timezone: 'America/Santiago' }
  const habit = (id: string, log_type: string, extra: object = {}) => ({ id, created_at: '2026-11-01T12:00:00Z', log_type, ...extra })
  const habits = [
    habit('h1', 'time'),
    habit('h2', 'watch'),
    habit('h3', 'cardio'),
    habit('h4', 'quantity', {
      quantity_unit: 'ml', quantity_label: null, quantity_target: 2000, quantity_step: 250, quantity_display: 'base', glass_ml: 250,
    }),
  ]
  const respond = (q: { table: string }) => {
    if (q.table === 'checkins') {
      return {
        data: [{ id: 'c1', habit_id: 'h1', local_date: '2026-11-03', created_at: '2026-11-03T15:00:00Z', photo_path: null, rejected_at: null, reject_reason: null }],
      }
    }
    if (q.table === 'time_entries') return { data: [{ checkin_id: 'c1', minutes: 30, topic: 'Álgebra', pomodoros: 1 }] }
    if (q.table === 'quantity_entries') {
      return { data: [{ id: 'q1', habit_id: 'h4', local_date: '2026-11-03', amount: 250, created_at: '2026-11-03T15:00:00Z' }] }
    }
    return { data: [] }
  }
  const V4 = ['time_entries', 'watch_entries', 'media_items', 'cardio_entries', 'quantity_entries']

  test('sin includeLogs (calendario ajeno, perfil público) no se consulta ninguna tabla v4', async () => {
    const { client, queries } = fakeSupabase(respond)
    const days = await loadMonthDays(client, { ...day, habits })
    expect(queries.map((q) => q.table).filter((t) => V4.includes(t))).toEqual([])
    expect(Object.values(days).flat().every((e) => e.log === null)).toBe(true)
    // ni siquiera "en progreso" por sumas de cantidad
    expect(Object.values(days).flat().some((e) => e.status === 'partial')).toBe(false)
  })

  test('con includeLogs el dueño ve el tiempo y la suma de cantidad como en progreso', async () => {
    const { client, queries } = fakeSupabase(respond)
    const days = await loadMonthDays(client, { ...day, habits, includeLogs: true })
    expect(queries.map((q) => q.table)).toContain('time_entries')
    expect(queries.map((q) => q.table)).toContain('quantity_entries')
    const d3 = days['2026-11-03']
    expect(d3.find((e) => e.habitId === 'h1')?.log).toMatchObject({ kind: 'time', minutes: 30 })
    expect(d3.find((e) => e.habitId === 'h4')).toMatchObject({ status: 'partial', progressLabel: '250 de 2.000 ml' })
  })

  test('includeLogs sin hábitos con registro v4 no consulta tablas v4', async () => {
    const { client, queries } = fakeSupabase(respond)
    await loadMonthDays(client, { ...day, habits: [habit('h9', 'none')], includeLogs: true })
    expect(queries.map((q) => q.table).filter((t) => V4.includes(t))).toEqual([])
  })
})
