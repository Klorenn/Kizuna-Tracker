import { describe, expect, test } from 'vitest'
import type { Book, ExerciseRef, ReadingEntry, WorkoutSet } from '@/domain/logs'
import type { QuantityConfig } from '@/domain/quantity'
import type { MediaItem } from '@/domain/watch'
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

  test('peso sin cambio calculable dice "Sin datos suficientes"', () => {
    const cards = buildLogCards({
      month: '2026-11',
      reading: null,
      workout: null,
      visits: null,
      weights: [{ date: '2026-11-05', kg: 71.9 }],
    })
    expect(cards[0].caption).toBe('Este mes: sin datos suficientes')
  })

  test('el último pesaje anterior a la ventana muestra valor y fecha', () => {
    const cards = buildLogCards({
      month: '2026-11',
      reading: null,
      workout: null,
      visits: null,
      weights: [],
      latestWeight: { date: '2024-06-10', kg: 79.5 },
    })
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ key: 'weight', value: '79,5 kg', href: '/resumen/peso', private: true })
    expect(cards[0].caption).toBe('Último registro: 10 de junio de 2024')
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

describe('buildLogCards v4: tiempo, series, cantidad y distancia', () => {
  const empty = { month: '2026-11', reading: null, workout: null, visits: null, weights: [] }
  const time = (date: string, minutes: number) => ({ date, habitId: 'est', minutes, topic: null, pomodoros: 0 })
  const media: MediaItem[] = [
    { id: 'd', title: 'Dune', kind: 'movie', totalSeasons: null, totalEpisodes: null, runtimeMin: 155, status: 'finished', finishedOn: '2026-11-04' },
    { id: 'p', title: 'Past Lives', kind: 'movie', totalSeasons: null, totalEpisodes: null, runtimeMin: 106, status: 'finished', finishedOn: '2026-11-15' },
    { id: 'o', title: 'Coco', kind: 'movie', totalSeasons: null, totalEpisodes: null, runtimeMin: 105, status: 'finished', finishedOn: '2026-10-09' },
    { id: 'k', title: 'Dark', kind: 'series', totalSeasons: 3, totalEpisodes: 26, runtimeMin: null, status: 'watching', finishedOn: null },
  ]
  const ep = (date: string, episodes: number) => ({ date, mediaId: 'k', episodes, season: 1, episodeTo: null, minutes: null, completed: false })
  const agua: QuantityConfig = { unit: 'ml', label: null, target: 2000, step: 250, display: 'glasses', glassMl: 250 }
  const run = (id: string, date: string, distanceM: number) => ({ id, date, kind: 'run' as const, distanceM, durationS: 1800 })

  test('tiempo: horas del mes con el mes anterior en pequeño', () => {
    const cards = buildLogCards({
      ...empty,
      time: [time('2026-10-03', 180), time('2026-11-02', 85), time('2026-11-09', 120), time('2026-11-16', 105)],
    })
    expect(cards.find((c) => c.key === 'time')).toEqual({
      key: 'time',
      label: 'Tiempo',
      value: '5 h 10 min',
      caption: 'Octubre: 3 h',
      href: '/resumen/tiempo?mes=2026-11',
    })
  })

  test('series: películas terminadas y episodios del mes', () => {
    const cards = buildLogCards({
      ...empty,
      watch: {
        media,
        entries: [ep('2026-10-01', 4), ep('2026-11-02', 2), ep('2026-11-03', 3)],
      },
    })
    expect(cards.find((c) => c.key === 'movies')).toMatchObject({
      label: 'Películas', value: '2', caption: 'Octubre: 1', href: '/resumen/series?mes=2026-11',
    })
    expect(cards.find((c) => c.key === 'episodes')).toMatchObject({
      label: 'Episodios', value: '5', caption: 'Octubre: 4', href: '/resumen/series?mes=2026-11',
    })
  })

  test('cantidad: promedio por día en vasos', () => {
    const cards = buildLogCards({
      ...empty,
      quantity: [
        {
          habitId: 'agua1',
          name: 'Agua',
          config: agua,
          entries: [
            { date: '2026-10-05', amount: 2000 },
            { date: '2026-11-02', amount: 1500 },
            { date: '2026-11-03', amount: 1650 },
          ],
          doneDates: [],
        },
      ],
    })
    expect(cards.find((c) => c.key === 'quantity')).toEqual({
      key: 'quantity',
      label: 'Agua',
      value: '6,3 vasos/día',
      caption: 'Octubre: 8 vasos/día',
      href: '/resumen/cantidad/agua1?mes=2026-11',
    })
  })

  test('cantidad: solo los 3 primeros hábitos, en orden de creación', () => {
    const q = (n: number) => ({ habitId: `h${n}`, name: `Hábito ${n}`, config: agua, entries: [], doneDates: [] })
    const cards = buildLogCards({ ...empty, quantity: [q(1), q(2), q(3), q(4)] })
    expect(cards.filter((c) => c.key === 'quantity').map((c) => c.label)).toEqual(['Hábito 1', 'Hábito 2', 'Hábito 3'])
  })

  test('distancia: km del mes y del anterior', () => {
    const cards = buildLogCards({
      ...empty,
      cardio: [run('a', '2026-10-04', 10000), run('b', '2026-11-02', 5200), run('c', '2026-11-09', 10000), run('d', '2026-11-16', 6300)],
    })
    expect(cards.find((c) => c.key === 'cardio')).toEqual({
      key: 'cardio',
      label: 'Trote',
      value: '21,5 km',
      caption: 'Octubre: 10 km',
      href: '/resumen/distancia?mes=2026-11',
    })
  })

  test('sin datos del mes las tarjetas no dicen NaN', () => {
    const cards = buildLogCards({ ...empty, time: [], cardio: [], watch: { media: [], entries: [] } })
    expect(cards.map((c) => c.value)).toEqual(['0 min', '0', '0', '0 km'])
    expect(JSON.stringify(cards)).not.toContain('NaN')
  })
})
