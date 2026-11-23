import { describe, expect, it } from 'vitest'
import {
  CARDIO_KIND_LABEL,
  CARDIO_QUESTION,
  cardioSeries,
  formatDistance,
  formatPace,
  monthlyCardio,
  paceSeconds,
  paceTrend,
  parseDistance,
  parseHms,
  speedKmh,
  validateCardioInput,
  type CardioKind,
} from '@/domain/cardio'
import { weeklyTotals } from '@/domain/time'

const r = (id: string, date: string, kind: CardioKind, distanceM: number, durationS: number) => ({ id, date, kind, distanceM, durationS })
const outs = [
  r('1', '2026-11-03', 'run', 5200, 1780),
  r('2', '2026-11-10', 'run', 3000, 1080),
  r('3', '2026-11-10', 'walk', 2500, 1800),
  r('4', '2026-11-17', 'run', 10000, 3300),
  r('5', '2026-11-20', 'run', 800, 240),
  r('6', '2026-10-08', 'run', 4000, 1500),
  r('7', '2026-10-22', 'run', 6000, 2160),
]

describe('cardio formatting', () => {
  it('computes and formats pace and speed', () => {
    expect(paceSeconds(5200, 1780)).toBe(342)
    expect(formatPace(342)).toBe('5:42 /km')
    expect(formatPace(330)).toBe('5:30 /km')
    expect(formatPace(720)).toBe('12:00 /km')
    expect(speedKmh(5200, 1780)).toBe(10.5)
  })
  it('formats distance in km, swimming in metres', () => {
    expect(formatDistance(5200, 'run')).toBe('5,2 km')
    expect(formatDistance(10000, 'run')).toBe('10 km')
    expect(formatDistance(1500, 'swim')).toBe('1.500 m')
  })
  it('has labels and questions per kind', () => {
    expect(Object.values(CARDIO_KIND_LABEL)).toEqual(['Trote', 'Caminata', 'Bicicleta', 'Natación', 'Otro'])
    expect(CARDIO_QUESTION.run).toBe('¿Cuánto trotaste hoy?')
    expect(CARDIO_QUESTION.other).toBe('¿Cuánto avanzaste hoy?')
  })
})

describe('cardio input', () => {
  it('parses distance', () => {
    expect(parseDistance('5,2', 'run')).toBe(5200)
    expect(parseDistance('5.25', 'bike')).toBe(5250)
    expect(parseDistance('1500', 'swim')).toBe(1500)
    for (const bad of ['', '0', '-3', 'abc', '501']) expect(parseDistance(bad, 'run')).toBeNull()
  })
  it('parses h/m/s', () => {
    expect(parseHms('0', '29', '40')).toBe(1780)
    expect(parseHms('1', '', '')).toBe(3600)
    for (const [h, m, s] of [['0', '0', '0'], ['0', '60', '0'], ['0', '1', '60'], ['25', '0', '0']]) {
      expect(parseHms(h, m, s)).toBeNull()
    }
  })
  it('validates an outing', () => {
    expect(validateCardioInput({ kind: 'run', distanceM: null, durationS: 1780 })).toEqual({ ok: false, error: 'Escribe la distancia.' })
    expect(validateCardioInput({ kind: 'run', distanceM: 5200, durationS: null })).toEqual({ ok: false, error: 'Escribe el tiempo.' })
    expect(validateCardioInput({ kind: 'run', distanceM: 5200, durationS: 1780 })).toEqual({ ok: true })
  })
})

describe('cardio stats', () => {
  it('summarises a month', () => {
    expect(monthlyCardio(outs, '2026-11')).toEqual({
      month: '2026-11',
      distanceM: 21500,
      durationS: 8200,
      outings: 5,
      longestM: 10000,
      bestPace: 330,
      averageM: 4300,
    })
    expect(monthlyCardio([], '2026-11')).toEqual({
      month: '2026-11',
      distanceM: 0,
      durationS: 0,
      outings: 0,
      longestM: 0,
      bestPace: null,
      averageM: 0,
    })
  })
  it('builds series, pace trend and weekly bars', () => {
    expect(cardioSeries(outs, ['2026-10', '2026-11'])).toEqual([
      { month: '2026-10', distanceM: 10000 },
      { month: '2026-11', distanceM: 21500 },
    ])
    expect(paceTrend(outs.filter((o) => o.date >= '2026-11-01'))).toEqual([
      { date: '2026-11-03', pace: 342 },
      { date: '2026-11-10', pace: 360 },
      { date: '2026-11-17', pace: 330 },
    ])
    expect(weeklyTotals(outs.map((o) => ({ date: o.date, value: o.distanceM })), '2026-11').map((x) => x.value)).toEqual([0, 5200, 5500, 10800, 0, 0])
  })
})
