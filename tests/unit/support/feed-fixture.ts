/**
 * One logical data set served through every way the app can read it: the table queries the feed used
 * before (`from('checkins')` with embedded habits, per-habit history) and the RPCs that replace them
 * (`friend_feed`, `checkin_dates`). A test that passes against both shapes proves the new reads return
 * the same data. Visibility (RLS) is not simulated here: `visible` is what the viewer may see, and
 * supabase/tests/perf_reads.test.sql pins who may see what.
 */
export type Call = { method: string; args: unknown[] }

export const ME = '11111111-1111-4111-8111-111111111111'
export const F1 = '22222222-2222-4222-8222-222222222222'
export const F2 = '33333333-3333-4333-8333-333333333333' // deleted profile: absent from public_profiles
export const F3 = '44444444-4444-4444-8444-444444444444'
export const NOW = new Date('2026-11-22T12:00:00Z')
export const TODAY = '2026-11-22'

export type Habit = { id: string; name: string; color: string; frequency_type: string; target_per_week: number | null }
export type Row = {
  id: string
  user_id: string
  habit_id: string
  local_date: string
  created_at: string
  photo_path: string | null
  rejected_at: string | null
  rejected_by: string | null
}
export type Db = {
  habits: Habit[]
  /** Rows the viewer may see, any order. */
  visible: Row[]
  /** Non-rejected check-in dates per habit (the streak history). */
  history: { id: string; habit_id: string; local_date: string }[]
  habitItems: { habit_id: string }[]
  checkinItems: { habit_id: string; local_date: string }[]
  challenges: Record<string, unknown>[]
  profiles: { id: string; username: string; display_name: string; avatar_path: string | null; avatar_preset: number | null }[]
}

const row = (id: string, user_id: string, habit_id: string, local_date: string, time: string, over: Partial<Row> = {}): Row => ({
  id,
  user_id,
  habit_id,
  local_date,
  created_at: `${local_date}T${time}.000Z`,
  photo_path: null,
  rejected_at: null,
  rejected_by: null,
  ...over,
})
const days = (habit_id: string, list: string[]) => list.map((d) => ({ id: `${habit_id}-${d}`, habit_id, local_date: d }))
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const FIXTURE: Db = {
  habits: [
    { id: 'h1', name: 'Correr', color: 'sage', frequency_type: 'daily', target_per_week: null },
    { id: 'h2', name: 'Leer', color: 'indigo', frequency_type: 'weekly', target_per_week: 3 },
    { id: 'h3', name: 'Comer bien', color: 'amber', frequency_type: 'daily', target_per_week: null },
    { id: 'h4', name: 'Gimnasio', color: 'rose', frequency_type: 'daily', target_per_week: null },
    { id: 'h5', name: 'Meditar', color: 'sage', frequency_type: 'daily', target_per_week: null },
    { id: 'h6', name: 'Estudiar', color: 'indigo', frequency_type: 'daily', target_per_week: null },
  ],
  visible: [
    // newest first on purpose scrambled below to prove the order comes from the read, not the fixture
    row(ID(3), F2, 'h3', '2026-11-21', '20:00:00'),
    row(ID(2), F1, 'h1', '2026-11-22', '09:00:00'),
    row(ID(1), F3, 'h4', '2026-11-22', '10:30:00', { photo_path: `${F3}/${ID(1)}.jpg` }),
    row(ID(4), F1, 'h2', '2026-11-21', '08:00:00'),
    row(ID(5), F1, 'h6', '2026-11-20', '07:00:00', { rejected_at: '2026-11-20T08:00:00.000Z', rejected_by: ME }),
    row(ID(6), F2, 'h5', '2026-11-19', '06:00:00'),
    row(ID(7), F1, 'h-gone', '2026-11-18', '05:00:00'),
  ],
  history: [
    ...days('h1', ['2026-11-22', '2026-11-21', '2026-11-20', '2026-11-19', '2026-11-18', '2026-11-17', '2026-11-16']),
    ...days('h2', ['2026-11-21', '2026-11-18', '2026-11-16', '2026-11-13', '2026-11-11', '2026-11-09']),
    ...days('h3', ['2026-11-21']),
    ...days('h4', ['2026-11-22']),
    ...days('h5', ['2026-11-19']),
  ],
  habitItems: [1, 2, 3, 4].map(() => ({ habit_id: 'h3' })),
  checkinItems: [1, 2, 3].map(() => ({ habit_id: 'h3', local_date: '2026-11-21' })),
  challenges: [
    {
      id: 'ch1', creator_id: F3, rival_id: ME, creator_habit_id: 'h4', rival_habit_id: 'mine',
      status: 'active', requires_photo: true, starts_on: '2026-11-16', weeks: 2,
    },
  ],
  profiles: [
    { id: F1, username: 'ana', display_name: 'Ana Pérez', avatar_path: null, avatar_preset: 3 },
    { id: F3, username: 'beto', display_name: 'Beto Soto', avatar_path: `${F3}/avatar.jpg`, avatar_preset: null },
  ],
}

const order = (a: Row, b: Row) =>
  b.local_date.localeCompare(a.local_date) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)

/** Fake client. `trips` records every request in the order it was issued, for round-trip assertions. */
export function feedClient(db: Db = FIXTURE) {
  const trips: string[] = []
  const rpcCalls: { name: string; params: Record<string, unknown> }[] = []
  const eqs = (calls: Call[], m: string) => calls.filter((c) => c.method === m).map((c) => c.args)

  function table(name: string, calls: Call[]): unknown {
    const sel = String(calls.find((c) => c.method === 'select')?.args[0] ?? '')
    const inCol = (col: string) => eqs(calls, 'in').find((a) => a[0] === col)?.[1] as string[] | undefined
    if (name === 'checkins' && sel.includes('rejected_by')) {
      let rows = [...db.visible]
      for (const [col, v] of eqs(calls, 'eq')) rows = rows.filter((r) => r[col as keyof Row] === v)
      for (const [col, v] of eqs(calls, 'neq')) rows = rows.filter((r) => r[col as keyof Row] !== v)
      if (eqs(calls, 'not').some((a) => a[0] === 'photo_path')) rows = rows.filter((r) => r.photo_path !== null)
      const limit = Number(eqs(calls, 'limit')[0]?.[0] ?? 1000)
      return rows
        .sort(order)
        .slice(0, limit)
        .map((r) => ({ ...r, habits: db.habits.find((h) => h.id === r.habit_id) ?? null }))
    }
    if (name === 'checkins') {
      const ids = inCol('habit_id') ?? []
      const gte = String(eqs(calls, 'gte').find((a) => a[0] === 'local_date')?.[1] ?? '')
      const lte = String(eqs(calls, 'lte').find((a) => a[0] === 'local_date')?.[1] ?? '9999-12-31')
      return db.history
        .filter((h) => ids.includes(h.habit_id) && h.local_date >= gte && h.local_date <= lte)
        .sort((a, b) => a.local_date.localeCompare(b.local_date))
    }
    if (name === 'habit_items') return db.habitItems.filter((i) => (inCol('habit_id') ?? []).includes(i.habit_id))
    if (name === 'checkin_items')
      return db.checkinItems.filter(
        (i) => (inCol('habit_id') ?? []).includes(i.habit_id) && (inCol('local_date') ?? []).includes(i.local_date),
      )
    if (name === 'challenges') return db.challenges
    if (name === 'public_profiles') return db.profiles.filter((p) => (inCol('id') ?? []).includes(p.id))
    return []
  }

  function rpc(name: string, p: Record<string, unknown>): unknown {
    if (name === 'friend_feed') {
      let rows = [...db.visible]
      if (p.p_owner) rows = rows.filter((r) => r.user_id === p.p_owner)
      else rows = rows.filter((r) => r.user_id !== ME)
      if (p.p_photos_only) rows = rows.filter((r) => r.photo_path !== null)
      if (p.p_cursor_day)
        rows = rows.filter(
          (r) =>
            r.local_date < String(p.p_cursor_day) ||
            (r.local_date === p.p_cursor_day &&
              (r.created_at < String(p.p_cursor_at) || (r.created_at === p.p_cursor_at && r.id < String(p.p_cursor_id)))),
        )
      return rows
        .sort(order)
        .slice(0, Number(p.p_limit) + 1)
        .map((r) => {
          const h = db.habits.find((x) => x.id === r.habit_id)
          return {
            ...r,
            habit_name: h?.name ?? null,
            habit_color: h?.color ?? null,
            habit_frequency_type: h?.frequency_type ?? null,
            habit_target_per_week: h?.target_per_week ?? null,
          }
        })
    }
    if (name === 'checkin_dates') {
      const ids = p.p_habit_ids as string[]
      const out = new Map<string, string[]>()
      for (const h of db.history)
        if (ids.includes(h.habit_id) && h.local_date >= String(p.p_from))
          out.set(h.habit_id, [...(out.get(h.habit_id) ?? []), h.local_date])
      return [...out].map(([habit_id, dates]) => ({ habit_id, dates: dates.sort().reverse() }))
    }
    return []
  }

  const thenable = (compute: () => unknown) => ({
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve({ data: compute(), error: null }).then(res, rej),
  })
  const client = {
    from(name: string) {
      const calls: Call[] = []
      trips.push(name)
      const proxy: unknown = new Proxy(
        {},
        {
          get(_t, m: string) {
            if (m === 'then') return thenable(() => table(name, calls)).then
            return (...args: unknown[]) => {
              calls.push({ method: m, args })
              return proxy
            }
          },
        },
      )
      return proxy
    },
    rpc(name: string, params: Record<string, unknown> = {}) {
      trips.push(`rpc:${name}`)
      rpcCalls.push({ name, params })
      return thenable(() => rpc(name, params))
    },
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}?t=1` })),
        }),
      }),
    },
  }
  return { client: client as never, trips, rpcCalls }
}
