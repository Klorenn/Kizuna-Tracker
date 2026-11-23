import { describe, expect, it } from 'vitest'
import { todayLogs } from '@/lib/today-logs'

describe('todayLogs', () => {
  it('maps reading entries and workout sessions to Hoy logs by habit', () => {
    const r = todayLogs(
      [{ habit_id: 'h1', checkin_id: 'c1', book_id: 'b1', from_page: 14, to_page: 40, books: { title: 'Dune' } }],
      [
        { id: 's1', habit_id: 'g1', day_types: ['legs'] },
        { id: 's2', habit_id: 'g2', day_types: ['cardio'] },
      ],
      [
        { session_id: 's1', exercise_id: 'sq' },
        { session_id: 's1', exercise_id: 'sq' },
        { session_id: 's1', exercise_id: 'press' },
        { session_id: 's1', exercise_id: 'ext' },
        { session_id: 's1', exercise_id: 'curl' },
        { session_id: 's1', exercise_id: 'rdl' },
      ],
    )
    expect(r.logs).toEqual({
      h1: [{ kind: 'reading', pages: 26, bookTitle: 'Dune' }],
      g1: [{ kind: 'workout', dayTypes: ['legs'], exerciseCount: 5 }],
      g2: [{ kind: 'workout', dayTypes: ['cardio'], exerciseCount: 0 }],
    })
    expect(r.readings).toEqual({ h1: { checkinId: 'c1', entry: { bookId: 'b1', fromPage: 14, toPage: 40 } } })
  })

  it('ignores unknown day types and missing books', () => {
    const r = todayLogs(
      [{ habit_id: 'h1', checkin_id: 'c1', book_id: 'b1', from_page: 0, to_page: 1, books: null }],
      [{ id: 's1', habit_id: 'g1', day_types: ['legs', 'yoga'] }],
      [],
    )
    expect(r.logs.h1).toEqual([{ kind: 'reading', pages: 1, bookTitle: 'Libro' }])
    expect(r.logs.g1).toEqual([{ kind: 'workout', dayTypes: ['legs'], exerciseCount: 0 }])
  })

  it('keeps both logs when a habit has a reading and a workout (log_type changed in between)', () => {
    const r = todayLogs(
      [{ habit_id: 'h', checkin_id: 'c', book_id: 'b', from_page: 10, to_page: 10, books: { title: 'Dune' } }],
      [{ id: 's', habit_id: 'h', day_types: ['legs'] }],
      [],
    )
    expect(r.logs.h).toEqual([
      { kind: 'reading', pages: 0, bookTitle: 'Dune' },
      { kind: 'workout', dayTypes: ['legs'], exerciseCount: 0 },
    ])
  })

  it('maps time, watch, cardio and quantity rows; the time wins over an old reading in Hoy', () => {
    const r = todayLogs(
      [{ habit_id: 's', checkin_id: 'c', book_id: 'b', from_page: 1, to_page: 5, books: { title: 'Dune' } }],
      [],
      [],
      {
        time: [{ habit_id: 's', minutes: 85, topic: 'Álgebra' }],
        watch: [
          { habit_id: 'v', episodes: 3, minutes: null, completed: false, media_items: { title: 'Dark', kind: 'series' } },
          { habit_id: 'm', episodes: null, minutes: null, completed: true, media_items: { title: 'Alien', kind: 'movie' } },
        ],
        cardio: [
          { habit_id: 'r', kind: 'run', distance_m: 5200, duration_s: 1780 },
          { habit_id: 'r', kind: 'walk', distance_m: 2500, duration_s: 1800 },
        ],
        quantity: [
          { id: 'q2', habit_id: 'w', amount: 250, created_at: '2026-11-22T12:10:00Z' },
          { id: 'q1', habit_id: 'w', amount: 500, created_at: '2026-11-22T11:00:00Z' },
        ],
      },
    )
    expect(r.logs.s).toEqual([
      { kind: 'reading', pages: 4, bookTitle: 'Dune' },
      { kind: 'time', minutes: 85, topic: 'Álgebra' },
    ])
    expect(r.logs.v).toEqual([
      { kind: 'watch', title: 'Dark', mediaKind: 'series', episodes: 3, minutes: null, completed: false },
    ])
    expect(r.logs.m).toEqual([
      { kind: 'watch', title: 'Alien', mediaKind: 'movie', episodes: null, minutes: null, completed: true },
    ])
    expect(r.logs.r).toEqual([
      {
        kind: 'cardio',
        entries: [
          { kind: 'run', distanceM: 5200, durationS: 1780 },
          { kind: 'walk', distanceM: 2500, durationS: 1800 },
        ],
      },
    ])
    // oldest first, amounts as numbers
    expect(r.quantity.w).toEqual([
      { id: 'q1', amount: 500, at: '2026-11-22T11:00:00Z' },
      { id: 'q2', amount: 250, at: '2026-11-22T12:10:00Z' },
    ])
  })

  it('quantity amounts that arrive as strings (numeric columns) become numbers', () => {
    const r = todayLogs([], [], [], {
      quantity: [{ id: 'q', habit_id: 'w', amount: '250.00' as unknown as number, created_at: '2026-11-22T11:00:00Z' }],
    })
    expect(r.quantity.w[0].amount).toBe(250)
  })
})
