import { describe, expect, test } from 'vitest'
import { loadMonthDays } from '@/lib/calendar-data'
import { fakeSupabase, type Recorded } from './support/fake-supabase'

const base = { userId: 'u1', month: '2026-11', today: '2026-11-22', timezone: 'America/Santiago' }
const reader = { id: 'h1', created_at: '2026-11-01T12:00:00Z', log_type: 'reading' }
const plain = { id: 'h2', created_at: '2026-11-01T12:00:00Z', log_type: 'none' }

const rows = (q: Recorded) => {
  switch (q.table) {
    case 'checkins':
      return [{ id: 'c1', habit_id: 'h1', local_date: '2026-11-03', created_at: '2026-11-03T15:00:00Z', photo_path: null, rejected_at: null, reject_reason: null }]
    case 'reading_entries':
      return [{ checkin_id: 'c1', book_id: 'b1', local_date: '2026-11-03', from_page: 1, to_page: 20 }]
    case 'books':
      return [{ id: 'b1', title: 'Dune', author: null, total_pages: 412, status: 'reading', finished_on: null }]
    default:
      return []
  }
}
const tablesOf = (queries: Recorded[]) => queries.map((q) => q.table)

describe('loadMonthDays: registros detallados solo bajo demanda', () => {
  test('por defecto no consulta ni adjunta registros', async () => {
    const { client, queries } = fakeSupabase((q) => ({ data: rows(q) }))
    const days = await loadMonthDays(client, { ...base, habits: [reader] })
    expect(tablesOf(queries)).not.toContain('reading_entries')
    expect(tablesOf(queries)).not.toContain('workout_sessions')
    expect(days['2026-11-03'][0].status).toBe('done')
    expect(days['2026-11-03'][0].log).toBeNull()
  })

  test('includeLogs: true adjunta el registro del hábito de lectura', async () => {
    const { client, queries } = fakeSupabase((q) => ({ data: rows(q) }))
    const days = await loadMonthDays(client, { ...base, habits: [reader], includeLogs: true })
    expect(tablesOf(queries)).toContain('reading_entries')
    expect(tablesOf(queries)).not.toContain('workout_sessions')
    expect(days['2026-11-03'][0].log).toMatchObject({ kind: 'reading', bookTitle: 'Dune', pages: 19 })
  })

  test('includeLogs: true sin hábitos con registro no consulta nada extra', async () => {
    const { client, queries } = fakeSupabase((q) => ({ data: rows(q) }))
    await loadMonthDays(client, { ...base, habits: [plain], includeLogs: true })
    expect(tablesOf(queries)).toEqual(['checkins', 'checkin_items', 'habit_items'])
  })
})
