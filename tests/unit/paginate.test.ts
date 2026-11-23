import { describe, expect, it, vi } from 'vitest'
import { fetchAll, PAGE_SIZE } from '@/lib/paginate'

/** A fake PostgREST endpoint that, like max_rows, never returns more than `cap` rows. */
function table(total: number, cap = PAGE_SIZE) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }))
  const page = vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, Math.min(to + 1, from + cap)),
    error: null,
  }))
  return { rows, page }
}

describe('fetchAll', () => {
  it('reads past the 1000-row cap, page by page', async () => {
    const t = table(2500)
    await expect(fetchAll(t.page)).resolves.toEqual(t.rows)
    expect(t.page.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('asks once more when the last page is exactly full', async () => {
    const t = table(2000)
    await expect(fetchAll(t.page)).resolves.toHaveLength(2000)
    expect(t.page).toHaveBeenCalledTimes(3)
  })

  it('stops after a short first page', async () => {
    const t = table(3)
    await expect(fetchAll(t.page)).resolves.toEqual(t.rows)
    expect(t.page).toHaveBeenCalledOnce()
  })

  it('treats a null page as empty', async () => {
    await expect(fetchAll(async () => ({ data: null, error: null }))).resolves.toEqual([])
  })

  it('throws on an error instead of returning a silently partial list', async () => {
    let calls = 0
    const page = async () =>
      ++calls === 1
        ? { data: Array.from({ length: PAGE_SIZE }, (_, i) => i), error: null }
        : { data: null, error: { message: 'boom' } }
    await expect(fetchAll(page)).rejects.toThrow('boom')
  })

  it('honours a smaller page size', async () => {
    const t = table(5, 2)
    await expect(fetchAll(t.page, 2)).resolves.toEqual(t.rows)
    expect(t.page.mock.calls).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ])
  })
})
