import { describe, expect, test } from 'vitest'
import { read, readRows } from '@/lib/read'

describe('read / readRows', () => {
  test('a good read returns its data; a row that matched nothing is null, a list is empty', () => {
    expect(read({ data: { id: 1 }, error: null })).toEqual({ id: 1 })
    expect(read({ data: null, error: null })).toBeNull()
    expect(readRows({ data: [1, 2], error: null })).toEqual([1, 2])
    expect(readRows({ data: null, error: null })).toEqual([])
  })

  test('a failed read throws instead of becoming empty or not-found', () => {
    expect(() => read({ data: null, error: { message: 'boom' } })).toThrow(/boom/)
    expect(() => readRows({ data: null, error: { message: 'boom' } })).toThrow(/boom/)
  })
})
