import { describe, expect, test } from 'vitest'
import {
  buildDaySummaries,
  dayAriaLabel,
  hasRecords,
  monthOverview,
  type CalendarHabitInput,
  type CheckinItemRow,
  type CheckinRow,
  type HabitDay,
} from '@/lib/calendar-days'
import type { DayLog } from '@/lib/logs-data'

const TZ = 'America/Santiago' // UTC-3 en noviembre

const leer: CalendarHabitInput = { id: 'h1', since: '2026-11-01', items: [] }
const comer: CalendarHabitInput = {
  id: 'h2',
  since: '2026-11-01',
  items: [
    // desordenados a propósito: manda la posición
    { id: 'i3', label: 'Once', position: 2, since: '2026-11-01', until: null },
    { id: 'i1', label: 'Desayuno', position: 0, since: '2026-11-01', until: null },
    { id: 'i4', label: 'Cena', position: 3, since: '2026-11-01', until: null },
    { id: 'i2', label: 'Almuerzo', position: 1, since: '2026-11-01', until: null },
  ],
}
const gym: CalendarHabitInput = { id: 'h3', since: '2026-11-20', items: [] }

const checkin = (over: Partial<CheckinRow>): CheckinRow => ({
  id: 'c1',
  habit_id: 'h1',
  local_date: '2026-11-23',
  created_at: '2026-11-23T11:15:00Z',
  photo_path: null,
  rejected_at: null,
  reject_reason: null,
  ...over,
})
const item = (over: Partial<CheckinItemRow>): CheckinItemRow => ({
  item_id: 'i1',
  habit_id: 'h2',
  local_date: '2026-11-23',
  created_at: '2026-11-23T12:00:00Z',
  photo_path: null,
  ...over,
})

describe('buildDaySummaries', () => {
  test('el registro del check-in va en su hábito, también si la foto fue rechazada', () => {
    const reading: DayLog = { kind: 'reading', bookTitle: 'Dune', fromPage: 14, toPage: 40, pages: 26, finishedBook: false }
    const days = buildDaySummaries({
      habits: [leer, gym],
      checkins: [
        checkin({}),
        checkin({ id: 'c2', habit_id: 'h3', rejected_at: '2026-11-23T20:00:00Z', reject_reason: 'unclear' }),
      ],
      checkinItems: [],
      dates: ['2026-11-23', '2026-11-24'],
      today: '2026-11-25',
      timezone: TZ,
      logs: new Map<string, DayLog>([
        ['c1', reading],
        ['c2', { kind: 'workout', dayTypes: ['cardio'], exercises: [], volumeKg: 0 }],
      ]),
    })
    expect(days['2026-11-23'][0].log).toEqual(reading)
    expect(days['2026-11-23'][1].log).toMatchObject({ kind: 'workout' })
    expect(days['2026-11-24'].map((e) => e.log)).toEqual([null, null])
  })

  test('hecho con hora local, en progreso con ítems y no registrado', () => {
    const days = buildDaySummaries({
      habits: [leer, comer, gym],
      checkins: [checkin({})],
      checkinItems: [
        item({ item_id: 'i3', created_at: '2026-11-23T21:30:00Z' }),
        item({ item_id: 'i1', created_at: '2026-11-23T10:05:00Z' }),
        item({ item_id: 'i2', created_at: '2026-11-23T16:40:00Z' }),
      ],
      dates: ['2026-11-23'],
      today: '2026-11-25',
      timezone: TZ,
    })
    expect(days['2026-11-23']).toEqual([
      { habitId: 'h1', status: 'done', time: '08:15', items: null, photos: [], rejectReason: null, log: null },
      {
        habitId: 'h2',
        status: 'partial',
        time: '18:30',
        items: { done: 3, total: 4, labels: ['Desayuno', 'Almuerzo', 'Once'] },
        photos: [],
        rejectReason: null,
        log: null,
      },
      { habitId: 'h3', status: 'none', time: null, items: null, photos: [], rejectReason: null, log: null },
    ])
  })

  test('un hábito aún no creado no aparece, salvo que tenga registros ese día', () => {
    const days = buildDaySummaries({
      habits: [leer, gym],
      checkins: [checkin({ id: 'c9', habit_id: 'h3', local_date: '2026-11-05', created_at: '2026-11-05T12:00:00Z' })],
      checkinItems: [],
      dates: ['2026-11-05', '2026-11-06'],
      today: '2026-11-25',
      timezone: TZ,
    })
    expect(days['2026-11-05'].map((e) => [e.habitId, e.status])).toEqual([
      ['h1', 'none'],
      ['h3', 'done'],
    ])
    expect(days['2026-11-06'].map((e) => e.habitId)).toEqual(['h1'])
  })

  test('check-in rechazado: no cuenta, guarda el motivo y la foto', () => {
    const days = buildDaySummaries({
      habits: [leer],
      checkins: [
        checkin({
          photo_path: 'u/c1.jpg',
          rejected_at: '2026-11-23T20:00:00Z',
          reject_reason: 'unclear',
        }),
      ],
      checkinItems: [],
      dates: ['2026-11-23'],
      today: '2026-11-25',
      timezone: TZ,
    })
    expect(days['2026-11-23'][0]).toEqual({
      habitId: 'h1',
      status: 'rejected',
      time: '08:15',
      items: null,
      photos: [{ path: 'u/c1.jpg', label: null }],
      rejectReason: 'unclear',
      log: null,
    })
  })

  test('motivo desconocido cae en "other"', () => {
    const days = buildDaySummaries({
      habits: [leer],
      checkins: [checkin({ rejected_at: '2026-11-23T20:00:00Z', reject_reason: 'raro' })],
      checkinItems: [],
      dates: ['2026-11-23'],
      today: '2026-11-25',
      timezone: TZ,
    })
    expect(days['2026-11-23'][0].rejectReason).toBe('other')
  })

  test('hoy sin registros queda pendiente; los días futuros no se arman', () => {
    const days = buildDaySummaries({
      habits: [leer],
      checkins: [],
      checkinItems: [],
      dates: ['2026-11-25', '2026-11-26'],
      today: '2026-11-25',
      timezone: TZ,
    })
    expect(days['2026-11-25'][0].status).toBe('pending')
    expect(days['2026-11-26']).toBeUndefined()
  })

  test('el total de ítems usa los activos ese día', () => {
    const h: CalendarHabitInput = {
      id: 'h2',
      since: '2026-11-01',
      items: [
        { id: 'i1', label: 'Desayuno', position: 0, since: '2026-11-01', until: null },
        { id: 'i2', label: 'Almuerzo', position: 1, since: '2026-11-01', until: '2026-11-10' }, // archivado
        { id: 'i3', label: 'Once', position: 2, since: '2026-11-20', until: null }, // creado después
      ],
    }
    const days = buildDaySummaries({
      habits: [h],
      checkins: [],
      checkinItems: [item({ local_date: '2026-11-15', created_at: '2026-11-15T12:00:00Z' })],
      dates: ['2026-11-05', '2026-11-15'],
      today: '2026-11-25',
      timezone: TZ,
    })
    expect(days['2026-11-15'][0].items).toEqual({ done: 1, total: 1, labels: ['Desayuno'] })
    // sin ítems marcados no hay progreso que mostrar
    expect(days['2026-11-05'][0].items).toBeNull()
  })

  test('hábito con ítems completo: hora del check-in y fotos de los ítems con su nombre', () => {
    const days = buildDaySummaries({
      habits: [comer],
      checkins: [checkin({ id: 'c2', habit_id: 'h2', created_at: '2026-11-23T23:59:00Z' })],
      checkinItems: [
        item({ item_id: 'i1' }),
        item({ item_id: 'i2', photo_path: 'u/items/x2.jpg' }),
        item({ item_id: 'i3' }),
        item({ item_id: 'i4' }),
      ],
      dates: ['2026-11-23'],
      today: '2026-11-25',
      timezone: TZ,
    })
    const e = days['2026-11-23'][0]
    expect(e.status).toBe('done')
    expect(e.time).toBe('20:59')
    expect(e.items).toEqual({ done: 4, total: 4, labels: ['Desayuno', 'Almuerzo', 'Once', 'Cena'] })
    expect(e.photos).toEqual([{ path: 'u/items/x2.jpg', label: 'Almuerzo' }])
  })

  test('foto del check-in primero, luego las de los ítems', () => {
    const days = buildDaySummaries({
      habits: [comer],
      checkins: [checkin({ habit_id: 'h2', photo_path: 'u/c1.jpg' })],
      checkinItems: [item({ item_id: 'i3', photo_path: 'u/items/3.jpg' })],
      dates: ['2026-11-23'],
      today: '2026-11-25',
      timezone: TZ,
    })
    expect(days['2026-11-23'][0].photos.map((p) => p.path)).toEqual(['u/c1.jpg', 'u/items/3.jpg'])
  })
})

describe('hasRecords', () => {
  const e = (status: HabitDay['status']): HabitDay => ({
    habitId: 'h',
    status,
    time: null,
    items: null,
    photos: [],
    rejectReason: null,
    log: null,
  })
  test('hecho, en progreso o rechazado cuentan como registro', () => {
    expect(hasRecords([e('none'), e('done')])).toBe(true)
    expect(hasRecords([e('partial')])).toBe(true)
    expect(hasRecords([e('rejected')])).toBe(true)
    expect(hasRecords([e('none'), e('pending')])).toBe(false)
    expect(hasRecords([])).toBe(false)
  })
})

describe('dayAriaLabel', () => {
  const names = { h1: 'Leer', h2: 'Comer bien', h3: 'Gimnasio' }
  const base = { time: null, items: null, photos: [], rejectReason: null, log: null }
  test('fecha y estado de cada hábito', () => {
    expect(
      dayAriaLabel('2026-11-23', '2026-11-25', [
        { habitId: 'h1', status: 'done', ...base },
        { habitId: 'h3', status: 'none', ...base },
      ], names),
    ).toBe('23 de noviembre: Leer hecho, Gimnasio no registrado')
  })
  test('hoy, en progreso y rechazado', () => {
    expect(
      dayAriaLabel('2026-11-25', '2026-11-25', [
        { habitId: 'h1', status: 'pending', ...base },
        { habitId: 'h2', status: 'partial', ...base, items: { done: 3, total: 4, labels: [] } },
        { habitId: 'h3', status: 'rejected', ...base, rejectReason: 'unclear' },
      ], names),
    ).toBe('Hoy, 25 de noviembre: Leer pendiente, Comer bien 3 de 4, Gimnasio con foto rechazada')
  })
  test('sin hábitos ese día', () => {
    expect(dayAriaLabel('2026-10-02', '2026-11-25', [], names)).toBe('2 de octubre: sin registros')
  })
})

describe('monthOverview', () => {
  test('días completados y mejor racha dentro del mes', () => {
    const done: Record<string, number> = {
      '2026-09-30': 1, // otro mes: no suma
      '2026-10-01': 1,
      '2026-10-02': 1,
      '2026-10-03': 1,
      '2026-10-10': 1,
      '2026-10-11': 1,
      '2026-10-31': 1,
      '2026-11-01': 1, // la racha se corta al terminar el mes
    }
    const o = monthOverview('2026-10', done, [{ since: '2026-01-01' }], '2026-11-25')
    expect(o.month).toBe('2026-10')
    expect(o.daysDone).toBe(6)
    expect(o.bestRun).toBe(3)
  })
  test('niveles según la fracción de hábitos hechos ese día', () => {
    const habits = [{ since: '2026-10-01' }, { since: '2026-10-01' }, { since: '2026-10-01' }]
    const o = monthOverview('2026-10', { '2026-10-05': 1, '2026-10-06': 2, '2026-10-07': 3 }, habits, '2026-11-25')
    const level = (date: string) => o.cells.flat().find((c) => c.date === date)?.level
    expect(level('2026-10-04')).toBe(0)
    expect(level('2026-10-05')).toBe(2)
    expect(level('2026-10-06')).toBe(3)
    expect(level('2026-10-07')).toBe(4)
  })
  test('cuenta solo los hábitos que ya existían ese día', () => {
    const habits = [{ since: '2026-10-01' }, { since: '2026-10-20' }]
    const o = monthOverview('2026-10', { '2026-10-05': 1 }, habits, '2026-11-25')
    expect(o.cells.flat().find((c) => c.date === '2026-10-05')?.level).toBe(4)
  })
  test('marca los días futuros y fuera del mes', () => {
    const o = monthOverview('2026-11', {}, [{ since: '2026-01-01' }], '2026-11-25')
    const cells = o.cells.flat()
    expect(cells.find((c) => c.date === '2026-11-26')?.future).toBe(true)
    expect(cells.find((c) => c.date === '2026-11-25')?.future).toBe(false)
    expect(cells.find((c) => c.date === '2026-10-31')?.inMonth).toBe(false)
    expect(o.daysDone).toBe(0)
    expect(o.bestRun).toBe(0)
  })
})

describe('cantidad: días con sumas bajo la meta', () => {
  const agua: CalendarHabitInput = { id: 'h4', since: '2026-11-01', items: [] }
  const config = { unit: 'ml', label: null, target: 2000, step: 250, display: 'base', glassMl: 250 } as const
  const log = (total: number): DayLog => ({
    kind: 'quantity',
    total,
    target: 2000,
    config,
    entries: [{ amount: total, time: '8:10' }],
  })
  const run = (withCheckin: boolean, total: number) =>
    buildDaySummaries({
      habits: [agua],
      checkins: withCheckin ? [checkin({ id: 'c7', habit_id: 'h4' })] : [],
      checkinItems: [],
      dates: ['2026-11-23'],
      today: '2026-11-25',
      timezone: TZ,
      quantityByHabitDay: new Map([['h4:2026-11-23', log(total)]]),
    })['2026-11-23'][0]

  test('1.250 de 2.000 ml sin check-in es "en progreso" con su etiqueta', () => {
    const e = run(false, 1250)
    expect(e).toMatchObject({ habitId: 'h4', status: 'partial', progressLabel: '1.250 de 2.000 ml' })
    expect(e.log).toMatchObject({ kind: 'quantity', total: 1250 })
    expect(dayAriaLabel('2026-11-23', '2026-11-25', [e], { h4: 'Agua' })).toBe('23 de noviembre: Agua 1.250 de 2.000 ml')
  })

  test('con check-in es hecho', () => {
    expect(run(true, 2000)).toMatchObject({ status: 'done', progressLabel: '2.000 de 2.000 ml' })
  })

  test('sin sumas ni check-in no hay registro', () => {
    const e = buildDaySummaries({
      habits: [agua],
      checkins: [],
      checkinItems: [],
      dates: ['2026-11-23'],
      today: '2026-11-25',
      timezone: TZ,
      quantityByHabitDay: new Map(),
    })['2026-11-23'][0]
    expect(e).toMatchObject({ status: 'none', log: null })
  })
})
