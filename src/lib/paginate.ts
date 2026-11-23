/**
 * PostgREST answers at most `max_rows` rows per request (1000 in supabase/config.toml and on
 * the hosted default) and truncates silently. PAGE_SIZE must not exceed it: a page shorter
 * than PAGE_SIZE is taken as the last one.
 */
export const PAGE_SIZE = 1000

type PageResult<T> = { data: T[] | null; error: { message: string } | null }

/**
 * Reads every row of a query, page by page, until a short page. `page(from, to)` must build a
 * FRESH query with a deterministic order (a unique column last) and apply `.range(from, to)`.
 * Throws on any error, so callers never act on a silently partial list.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < pageSize) return out
  }
}
