import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, localDate } from '@/domain/dates'

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] }
const calls: Call[] = []
const rpc = vi.fn()
// results by "table.op"
let results: Record<string, unknown> = {}
let user: { id: string } | null = { id: 'u1' }

function chain(call: Call, result: () => unknown) {
  const c: Record<string, unknown> = {}
  for (const m of ['eq', 'is', 'in', 'limit', 'select', 'order']) {
    c[m] = (col: string, v: unknown) => {
      if (m === 'eq') call.filters.push([col, v])
      return c
    }
  }
  c.single = async () => result()
  c.maybeSingle = async () => result()
  c.then = (res: (v: unknown) => unknown) => res(result())
  return c
}

function builder(table: string) {
  const op = (name: string, payload?: unknown) => {
    const call: Call = { table, op: name, payload, filters: [] }
    calls.push(call)
    return chain(call, () => results[`${table}.${name}`] ?? { data: null, error: null })
  }
  return {
    insert: (p: unknown) => op('insert', p),
    update: (p: unknown) => op('update', p),
    delete: () => op('delete'),
    select: () => op('select'),
  }
}

const client = {
  auth: { getUser: async () => ({ data: { user } }) },
  rpc,
  from: (t: string) => builder(t),
}

vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => client }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  checkInWithReading,
  createBook,
  deleteBook,
  deleteReading,
  saveReading,
  setBookFinished,
  setBookTotalPages,
  updateBook,
} from '@/app/(app)/registros/actions'

beforeEach(() => {
  calls.length = 0
  rpc.mockReset()
  // an update that touched the book (zero rows is the failure case, set per test)
  results = {
    'books.update': { data: [{ id: 'b1' }], error: null },
    'books.delete': { data: [{ id: 'b1' }], error: null },
  }
  user = { id: 'u1' }
})

const entry = { bookId: 'b1', fromPage: 14, toPage: 40, finished: false }

describe('checkInWithReading', () => {
  it('checks in, then saves the reading on that check-in', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'create_checkin' ? { data: [{ checkin_id: 'c1', created: true }], error: null } : { data: 'r1', error: null },
    )
    await expect(checkInWithReading('h1', entry)).resolves.toEqual({ ok: true, checkinId: 'c1', created: true })
    expect(rpc.mock.calls).toEqual([
      ['create_checkin', { p_habit_id: 'h1' }],
      ['save_reading_entry', { p_checkin_id: 'c1', p_book_id: 'b1', p_from_page: 14, p_to_page: 40, p_finished: false }],
    ])
  })

  it('"Solo marcar" (no entry) only checks in', async () => {
    rpc.mockResolvedValue({ data: [{ checkin_id: 'c1', created: true }], error: null })
    await expect(checkInWithReading('h1', null)).resolves.toEqual({ ok: true, checkinId: 'c1', created: true })
    expect(rpc.mock.calls).toEqual([['create_checkin', { p_habit_id: 'h1' }]])
  })

  it('a failed reading keeps the check-in and says so', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'create_checkin'
        ? { data: [{ checkin_id: 'c1', created: true }], error: null }
        : { data: null, error: { message: 'invalid_pages', code: 'P0001' } },
    )
    await expect(checkInWithReading('h1', entry)).resolves.toEqual({
      ok: false,
      checkedIn: true,
      error: 'Revisa las páginas: la final no puede ser menor que la inicial.',
    })
  })

  it('an unknown reading failure keeps the check-in with the spec copy', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'create_checkin'
        ? { data: [{ checkin_id: 'c1', created: true }], error: null }
        : { data: null, error: { message: 'boom' } },
    )
    await expect(checkInWithReading('h1', entry)).resolves.toEqual({
      ok: false,
      checkedIn: true,
      error: 'Marcamos el hábito, pero no guardamos la lectura. Inténtalo de nuevo.',
    })
  })

  it('validates pages before any rpc', async () => {
    await expect(checkInWithReading('h1', { ...entry, fromPage: 40, toPage: 14 })).resolves.toEqual({
      ok: false,
      checkedIn: false,
      error: 'La página final no puede ser menor que la inicial.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('a failed check-in reports checkedIn false', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_authenticated' } })
    await expect(checkInWithReading('h1', entry)).resolves.toEqual({
      ok: false,
      checkedIn: false,
      error: 'Inicia sesión para continuar.',
    })
  })
})

describe('saveReading / deleteReading', () => {
  it('saves on an existing check-in and maps errors', async () => {
    rpc.mockResolvedValue({ data: 'r1', error: null })
    await expect(saveReading('c1', { ...entry, finished: true })).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('save_reading_entry', {
      p_checkin_id: 'c1',
      p_book_id: 'b1',
      p_from_page: 14,
      p_to_page: 40,
      p_finished: true,
    })
    rpc.mockResolvedValue({ data: null, error: { message: 'checkin_not_found' } })
    await expect(saveReading('c9', entry)).resolves.toEqual({ ok: false, error: 'Ese día no tiene check-in.' })
    rpc.mockResolvedValue({ data: null, error: { message: 'book_not_found' } })
    await expect(saveReading('c1', entry)).resolves.toEqual({ ok: false, error: 'No encontramos ese libro.' })
    rpc.mockResolvedValue({ data: null, error: { message: 'log_type_mismatch' } })
    await expect(saveReading('c1', entry)).resolves.toEqual({
      ok: false,
      error: 'Este hábito no lleva ese tipo de registro.',
    })
  })

  it('validates pages before the rpc', async () => {
    await expect(saveReading('c1', { ...entry, fromPage: -1 })).resolves.toEqual({
      ok: false,
      error: 'Las páginas empiezan en 0.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('deleteReading calls delete_reading_entry', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await expect(deleteReading('c1')).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('delete_reading_entry', { p_checkin_id: 'c1' })
  })
})

describe('books', () => {
  it('createBook validates, trims and inserts for the user', async () => {
    results['books.insert'] = { data: { id: 'b1' }, error: null }
    await expect(createBook({ title: '  Dune ', author: ' Frank Herbert ', totalPages: 412 })).resolves.toEqual({
      ok: true,
      id: 'b1',
    })
    expect(calls[0]).toMatchObject({
      table: 'books',
      op: 'insert',
      payload: { user_id: 'u1', title: 'Dune', author: 'Frank Herbert', total_pages: 412 },
    })
    await expect(createBook({ title: ' ', author: null, totalPages: null })).resolves.toEqual({
      ok: false,
      error: 'Ponle un título al libro.',
    })
  })

  it('createBook without a session', async () => {
    user = null
    await expect(createBook({ title: 'Dune', author: null, totalPages: null })).resolves.toEqual({
      ok: false,
      error: 'Inicia sesión para continuar.',
    })
  })

  it('updateBook updates the fields of that book', async () => {
    await expect(updateBook('b1', { title: 'Rayuela', author: null, totalPages: 600 })).resolves.toEqual({ ok: true })
    expect(calls.find((c) => c.op === 'update')).toMatchObject({
      table: 'books',
      op: 'update',
      payload: { title: 'Rayuela', author: null, total_pages: 600 },
      filters: [['id', 'b1']],
    })
  })

  it('updateBook sets the total pages of a book that had none', async () => {
    await expect(updateBook('b1', { title: 'Dune', author: null, totalPages: 412 })).resolves.toEqual({ ok: true })
    expect(calls.find((c) => c.op === 'update')).toMatchObject({
      table: 'books',
      op: 'update',
      payload: { title: 'Dune', author: null, total_pages: 412 },
      filters: [['id', 'b1']],
    })
  })

  it('setBookTotalPages changes only total_pages (title and author stay)', async () => {
    await expect(setBookTotalPages('b1', 412)).resolves.toEqual({ ok: true })
    expect(calls.find((c) => c.op === 'update')).toMatchObject({ table: 'books', op: 'update', payload: { total_pages: 412 }, filters: [['id', 'b1']] })
    expect(Object.keys(calls.find((c) => c.op === 'update')?.payload as object)).toEqual(['total_pages'])
    calls.length = 0
    await expect(setBookTotalPages('b1', 0)).resolves.toEqual({ ok: false, error: 'Las páginas del libro van de 1 a 20000.' })
    await expect(setBookTotalPages('b1', 1.5)).resolves.toEqual({ ok: false, error: 'Las páginas del libro van de 1 a 20000.' })
    expect(calls).toEqual([])
  })

  it('setBookTotalPages and updateBook refuse a total below the highest logged page', async () => {
    results['reading_entries.select'] = { data: { to_page: 150 }, error: null }
    const copy = 'Ya registraste hasta la página 150: el total no puede ser menor.'
    await expect(setBookTotalPages('b1', 120)).resolves.toEqual({ ok: false, error: copy })
    await expect(updateBook('b1', { title: 'Dune', author: null, totalPages: 149 })).resolves.toEqual({ ok: false, error: copy })
    expect(calls.some((c) => c.op === 'update')).toBe(false)
    // the read is for this book only
    expect(calls.find((c) => c.table === 'reading_entries')?.filters).toEqual([['book_id', 'b1']])
    // exactly the highest page is fine, and so is a book without readings
    await expect(setBookTotalPages('b1', 150)).resolves.toEqual({ ok: true })
    results['reading_entries.select'] = { data: null, error: null }
    await expect(setBookTotalPages('b1', 10)).resolves.toEqual({ ok: true })
  })

  it('setBookTotalPages refuses the change when the pages cannot be read', async () => {
    results['reading_entries.select'] = { data: null, error: { message: 'boom' } }
    await expect(setBookTotalPages('b1', 300)).resolves.toEqual({
      ok: false,
      error: 'No pudimos guardar los cambios. Inténtalo de nuevo.',
    })
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('updateBook and setBookTotalPages report a book that matched no row (foreign or deleted id)', async () => {
    results['books.update'] = { data: [], error: null }
    await expect(updateBook('b9', { title: 'Dune', author: null, totalPages: 412 })).resolves.toEqual({
      ok: false,
      error: 'No encontramos ese libro.',
    })
    await expect(setBookTotalPages('b9', 412)).resolves.toEqual({ ok: false, error: 'No encontramos ese libro.' })
    // the update asked for the affected rows
    expect(calls.filter((c) => c.table === 'books').every((c) => c.op === 'update')).toBe(true)
  })

  it('updateBook and setBookTotalPages need a session', async () => {
    user = null
    await expect(updateBook('b1', { title: 'Dune', author: null, totalPages: 412 })).resolves.toEqual({
      ok: false,
      error: 'Inicia sesión para continuar.',
    })
    await expect(setBookTotalPages('b1', 412)).resolves.toEqual({ ok: false, error: 'Inicia sesión para continuar.' })
    expect(calls).toEqual([])
  })

  it('setBookFinished refuses a date after today in the profile timezone', async () => {
    results['profiles.select'] = { data: { timezone: 'Pacific/Kiritimati' }, error: null }
    const tomorrow = addDays(localDate(new Date(), 'Pacific/Kiritimati'), 1)
    await expect(setBookFinished('b1', tomorrow)).resolves.toEqual({ ok: false, error: 'La fecha no puede ser futura.' })
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('setBookFinished marks finished on a date, or back to reading with null', async () => {
    results['profiles.select'] = { data: { timezone: 'America/Santiago' }, error: null }
    await expect(setBookFinished('b1', '2026-11-02')).resolves.toEqual({ ok: true })
    // the timezone comes from the caller's own profile row (friends' rows are readable too)
    expect(calls.find((c) => c.table === 'profiles')?.filters).toEqual([['id', 'u1']])
    expect(calls.find((c) => c.op === 'update')).toMatchObject({
      payload: { status: 'finished', finished_on: '2026-11-02' },
      filters: [['id', 'b1']],
    })
    calls.length = 0
    await expect(setBookFinished('b1', null)).resolves.toEqual({ ok: true })
    expect(calls.find((c) => c.op === 'update')).toMatchObject({ payload: { status: 'reading', finished_on: null } })
  })

  it('setBookFinished maps the database guard and rejects malformed dates', async () => {
    results['profiles.select'] = { data: { timezone: 'America/Santiago' }, error: null }
    results['books.update'] = { data: null, error: { message: 'invalid_finished_on', code: '23514' } }
    await expect(setBookFinished('b1', '2026-11-02')).resolves.toEqual({
      ok: false,
      error: 'La fecha no puede ser futura.',
    })
    await expect(setBookFinished('b1', '2026-13-40')).resolves.toEqual({ ok: false, error: 'Elige una fecha válida.' })
  })

  it('deleteBook deletes that book', async () => {
    await expect(deleteBook('b1')).resolves.toEqual({ ok: true })
    expect(calls[0]).toMatchObject({ table: 'books', op: 'delete', filters: [['id', 'b1']] })
    results['books.delete'] = { error: { message: 'boom' } }
    await expect(deleteBook('b1')).resolves.toEqual({
      ok: false,
      error: 'No pudimos guardar los cambios. Inténtalo de nuevo.',
    })
  })
})

describe('every action verifies the session first', () => {
  const SIGN_IN = 'Inicia sesión para continuar.'
  const entry = { bookId: 'b1', fromPage: 1, toPage: 20, finished: false }
  it.each([
    ['checkInWithReading', () => checkInWithReading('h1', entry), { ok: false, checkedIn: false, error: SIGN_IN }],
    ['checkInWithReading (no entry)', () => checkInWithReading('h1', null), { ok: false, checkedIn: false, error: SIGN_IN }],
    ['saveReading', () => saveReading('c1', entry), { ok: false, error: SIGN_IN }],
    ['deleteReading', () => deleteReading('c1'), { ok: false, error: SIGN_IN }],
    ['createBook', () => createBook({ title: 'Dune', author: null, totalPages: 412 }), { ok: false, error: SIGN_IN }],
    ['updateBook', () => updateBook('b1', { title: 'Dune', author: null, totalPages: 412 }), { ok: false, error: SIGN_IN }],
    ['setBookTotalPages', () => setBookTotalPages('b1', 412), { ok: false, error: SIGN_IN }],
    ['setBookFinished (no date)', () => setBookFinished('b1', null), { ok: false, error: SIGN_IN }],
    ['deleteBook', () => deleteBook('b1'), { ok: false, error: SIGN_IN }],
  ])('%s: sign-in copy, no rpc and no write', async (_name, call, expected) => {
    user = null
    expect(await call()).toEqual(expected)
    expect(rpc).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })
})

describe('direct writes that change no row are "not found"', () => {
  it.each([['empty rows', { data: [], error: null }], ['no rows', { data: null, error: null }]])(
    'setBookFinished and deleteBook with %s',
    async (_name, none) => {
      results['books.update'] = none
      results['books.delete'] = none
      results['profiles.select'] = { data: { timezone: 'America/Santiago' }, error: null }
      await expect(setBookFinished('b9', '2026-11-02')).resolves.toEqual({ ok: false, error: 'No encontramos ese libro.' })
      await expect(deleteBook('b9')).resolves.toEqual({ ok: false, error: 'No encontramos ese libro.' })
    },
  )
})
