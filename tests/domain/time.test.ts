import { describe, expect, it } from 'vitest'
import {
  formatClock,
  formatDuration,
  formatHms,
  formatSignedDuration,
  monthlyTime,
  parseDuration,
  timeSeries,
  weeklyTotals,
} from '@/domain/time'

const t = (date: string, habitId: string, minutes: number, pomodoros = 0, topic: string | null = null) => ({
  date,
  habitId,
  minutes,
  topic,
  pomodoros,
})
const entries = [
  t('2026-11-02', 'e1', 85, 0, 'Álgebra'),
  t('2026-11-03', 'e1', 100, 4),
  t('2026-11-03', 'e2', 30),
  t('2026-11-10', 'e1', 50, 1),
  t('2026-11-17', 'e1', 45),
  t('2026-10-20', 'e1', 120),
  t('2026-10-27', 'e1', 60),
]

describe('time formatting', () => {
  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(85)).toBe('1 h 25 min')
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(1440)).toBe('24 h')
  })
  it('formats signed durations with a real minus sign', () => {
    expect(formatSignedDuration(130)).toBe('+2 h 10 min')
    expect(formatSignedDuration(-45)).toBe('−45 min')
    expect(formatSignedDuration(0)).toBe('0 min')
  })
  it('formats h:mm:ss and clock readouts', () => {
    expect(formatHms(1780)).toBe('29:40')
    expect(formatHms(3700)).toBe('1:01:40')
    expect(formatHms(59)).toBe('0:59')
    expect(formatClock(25 * 60_000)).toBe('25:00')
    expect(formatClock(59_001)).toBe('01:00')
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(90 * 60_000)).toBe('90:00')
  })
})

describe('time formatting with bad input', () => {
  it('never prints NaN', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, -5]) {
      expect(formatDuration(bad)).toBe('0 min')
      expect(formatSignedDuration(bad)).not.toContain('NaN')
      expect(formatHms(bad)).toBe('0:00')
      expect(formatClock(bad)).toBe('00:00')
    }
  })
})

describe('parseDuration', () => {
  it('accepts hours and minutes up to a day', () => {
    expect(parseDuration('1', '25')).toBe(85)
    expect(parseDuration('', '45')).toBe(45)
    expect(parseDuration('24', '0')).toBe(1440)
  })
  it('rejects empty, out of range and non-integer input', () => {
    for (const [h, m] of [['0', '0'], ['', ''], ['0', '60'], ['25', '0'], ['24', '1'], ['1,5', '0'], ['-1', '0']]) {
      expect(parseDuration(h, m)).toBeNull()
    }
  })
})

describe('time stats', () => {
  it('summarises a month, optionally for one habit', () => {
    expect(monthlyTime(entries, '2026-11')).toEqual({
      month: '2026-11',
      minutes: 310,
      days: 4,
      averagePerDay: 78,
      bestDay: { date: '2026-11-03', minutes: 130 },
      pomodoros: 5,
    })
    expect(monthlyTime(entries, '2026-11', 'e1')).toEqual({
      month: '2026-11',
      minutes: 280,
      days: 4,
      averagePerDay: 70,
      bestDay: { date: '2026-11-03', minutes: 100 },
      pomodoros: 5,
    })
    expect(monthlyTime([], '2026-11')).toEqual({
      month: '2026-11',
      minutes: 0,
      days: 0,
      averagePerDay: 0,
      bestDay: null,
      pomodoros: 0,
    })
  })
  it('breaks best-day ties by the earliest date', () => {
    const tie = [t('2026-11-05', 'e1', 60), t('2026-11-04', 'e1', 60)]
    expect(monthlyTime(tie, '2026-11').bestDay).toEqual({ date: '2026-11-04', minutes: 60 })
  })
  it('builds a series with zeros', () => {
    expect(timeSeries(entries, ['2026-09', '2026-10', '2026-11'])).toEqual([
      { month: '2026-09', minutes: 0 },
      { month: '2026-10', minutes: 180 },
      { month: '2026-11', minutes: 310 },
    ])
  })
  it('totals Monday-start weeks clipped to the month', () => {
    expect(weeklyTotals(entries.map((e) => ({ date: e.date, value: e.minutes })), '2026-11')).toEqual([
      { weekStart: '2026-10-26', value: 0 },
      { weekStart: '2026-11-02', value: 215 },
      { weekStart: '2026-11-09', value: 50 },
      { weekStart: '2026-11-16', value: 45 },
      { weekStart: '2026-11-23', value: 0 },
      { weekStart: '2026-11-30', value: 0 },
    ])
  })
})
