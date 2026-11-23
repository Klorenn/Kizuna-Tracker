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
})
