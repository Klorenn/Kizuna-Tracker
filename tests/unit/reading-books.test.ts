import { describe, expect, it } from 'vitest'
import { bookDeleteCopy, pickerBooks } from '@/lib/reading-books'

describe('pickerBooks', () => {
  const books = [
    { id: 'd', title: 'Dune', total_pages: 412, status: 'reading', created_at: '2026-10-01T00:00:00Z' },
    { id: 'r', title: 'Rayuela', total_pages: null, status: 'reading', created_at: '2026-10-05T00:00:00Z' },
    { id: 'p', title: 'Pedro Páramo', total_pages: 130, status: 'finished', created_at: '2026-09-01T00:00:00Z' },
    { id: 'n', title: 'Nuevo', total_pages: null, status: 'reading', created_at: '2026-11-20T00:00:00Z' },
  ]
  const entries = [
    { book_id: 'd', local_date: '2026-11-20', from_page: 14, to_page: 40 },
    { book_id: 'd', local_date: '2026-11-21', from_page: 40, to_page: 75 },
    { book_id: 'r', local_date: '2026-11-22', from_page: 580, to_page: 600 },
    { book_id: 'p', local_date: '2026-11-23', from_page: 100, to_page: 130 },
  ]
  it('lists reading books, last used first, then newest; with where to continue', () => {
    expect(pickerBooks(books, entries)).toEqual([
      { id: 'r', title: 'Rayuela', totalPages: null, nextFrom: 600 },
      { id: 'd', title: 'Dune', totalPages: 412, nextFrom: 75 },
      { id: 'n', title: 'Nuevo', totalPages: null, nextFrom: 0 },
    ])
  })
  it('keeps a finished book when it is the one being edited', () => {
    expect(pickerBooks(books, entries, 'p').map((b) => b.id)).toEqual(['p', 'r', 'd', 'n'])
  })
})

describe('bookDeleteCopy', () => {
  it('counts readings and pages', () => {
    expect(bookDeleteCopy(3, 81)).toBe('Se borrarán 3 lecturas (81 páginas). Tus check-ins no cambian.')
    expect(bookDeleteCopy(1, 1)).toBe('Se borrará 1 lectura (1 página). Tus check-ins no cambian.')
    expect(bookDeleteCopy(0, 0)).toBe('El libro no tiene lecturas. Tus check-ins no cambian.')
  })
})
