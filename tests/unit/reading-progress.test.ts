import { describe, expect, test } from 'vitest'
import { bookPageHint } from '@/components/logs/ReadingProgress'
import type { Book, ReadingEntry } from '@/domain/logs'

const book = (totalPages: number | null): Book => ({
  id: 'b1',
  title: 'Dune',
  author: null,
  totalPages,
  status: 'reading',
  finishedOn: null,
})
const entry = (date: string, toPage: number): ReadingEntry => ({ date, bookId: 'b1', fromPage: 0, toPage })

describe('bookPageHint', () => {
  test('con lecturas en la ventana, la última página alcanzada', () => {
    expect(bookPageHint(book(412), [entry('2026-11-22', 40)], null)).toBe('página 40 de 412 · 10 %')
    expect(bookPageHint(book(null), [entry('2026-11-22', 40)], null)).toBe('página 40')
  })

  test('sin lecturas en la ventana usa la última página conocida del libro', () => {
    expect(bookPageHint(book(412), [], 250)).toBe('página 250 de 412 · 61 %')
  })

  test('sin ninguna lectura conocida no muestra "Página 0"', () => {
    expect(bookPageHint(book(null), [], null)).toBeNull()
    expect(bookPageHint(book(412), [], null)).toBe('412 páginas')
  })
})
