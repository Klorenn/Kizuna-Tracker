import type { Recorded, Respond } from './fake-supabase'

/**
 * Like `fakeSupabase`, but a query only answers when the test releases it, so a test can see
 * WHICH queries a loader has issued while nothing has come back yet (the proof of concurrency)
 * and count its serial levels: one level = one round of "release everything that is waiting".
 */
export function gatedSupabase(respond: Respond) {
  const queries: Recorded[] = []
  const waiting: { q: Recorded; release: () => void }[] = []
  const settle = (q: Recorded, resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    new Promise<void>((release) => waiting.push({ q, release })).then(() => {
      try {
        const r = respond(q)
        return Promise.resolve({ data: r.data, error: r.error ?? null, count: r.count ?? null }).then(resolve, reject)
      } catch (e) {
        return Promise.reject(e).then(resolve, reject)
      }
    })
  const builder = (table: string) => {
    const q: Recorded = { table, calls: [] }
    queries.push(q)
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, method: string) {
          if (method === 'then') return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => settle(q, resolve, reject)
          return (...args: unknown[]) => {
            q.calls.push({ method, args })
            return proxy
          }
        },
      },
    )
    return proxy
  }
  const rpc = (name: string, params: unknown) => {
    const q: Recorded = { table: `rpc:${name}`, calls: [{ method: 'rpc', args: [params] }] }
    queries.push(q)
    return { then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => settle(q, resolve, reject) }
  }
  const client = { from: builder, rpc, storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }) }) } }
  const tick = () => new Promise<void>((r) => setTimeout(r, 0))

  /**
   * Drives `work` to completion, releasing every waiting query once per round. `levels` lists the
   * tables awaited in each round: its length is the serial depth of the loader.
   */
  async function run<T>(work: Promise<T>): Promise<{ value: T; levels: string[][] }> {
    let done = false
    let value!: T
    let failure: unknown
    let failed = false
    work.then(
      (v) => {
        value = v
        done = true
      },
      (e) => {
        failure = e
        failed = true
        done = true
      },
    )
    const levels: string[][] = []
    for (let guard = 0; guard < 50; guard++) {
      await tick()
      if (waiting.length === 0) break
      const batch = waiting.splice(0)
      levels.push(batch.map((w) => w.q.table))
      for (const w of batch) w.release()
    }
    await tick()
    if (!done) throw new Error('loader never settled')
    if (failed) throw failure
    return { value, levels }
  }
  return { client: client as never, queries, run, tick, waiting }
}
