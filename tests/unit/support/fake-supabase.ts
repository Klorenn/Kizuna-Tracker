/** Recording fake of the Supabase query builder: every chained call is logged, the await yields `respond`. */
export type Call = { method: string; args: unknown[] }
export type Recorded = { table: string; calls: Call[] }

export type Respond = (q: Recorded) => { data: unknown; error?: { message: string } | null }

export function fakeSupabase(respond: Respond) {
  const queries: Recorded[] = []
  const builder = (table: string) => {
    const q: Recorded = { table, calls: [] }
    queries.push(q)
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, method: string) {
          if (method === 'then') {
            return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
              try {
                const r = respond(q)
                return Promise.resolve({ data: r.data, error: r.error ?? null }).then(resolve, reject)
              } catch (e) {
                return Promise.reject(e).then(resolve, reject)
              }
            }
          }
          return (...args: unknown[]) => {
            q.calls.push({ method, args })
            return proxy
          }
        },
      },
    )
    return proxy
  }
  const client = {
    from: builder,
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }) }) },
  }
  return { client: client as never, queries }
}

export const args = (q: Recorded, method: string) => q.calls.filter((c) => c.method === method).map((c) => c.args)
