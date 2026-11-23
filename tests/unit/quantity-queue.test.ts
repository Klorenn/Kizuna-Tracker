import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  attachQuantityQueueTriggers,
  backoffDelay,
  createQuantityQueue,
  goalMet,
  newEntryId,
  offlineAfter,
  parseTypedAmount,
  parseTypedAmountResult,
  doneAfterSync,
  resetSharedQuantityQueue,
  resolveTarget,
  sharedQuantityQueue,
  type QueueEvent,
} from '@/lib/quantity-queue'
import { validateQuantityConfig, type QuantityConfig } from '@/domain/quantity'

type Send = Parameters<typeof createQuantityQueue>[0]
const OK = (total: number) => ({ ok: true as const, total, target: 2000, done: false })
const NET = { ok: false as const, error: 'Sin conexión.', retry: true }
const NO = (error: string) => ({ ok: false as const, error, retry: false })
const never = () => new Promise<never>(() => {})

class MemoryStorage {
  m = new Map<string, string>()
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
}

let storage: MemoryStorage
let n: number
const ids = () => `q${++n}`

afterEach(() => vi.unstubAllGlobals())

beforeEach(() => {
  storage = new MemoryStorage()
  n = 0
  vi.stubGlobal('sessionStorage', storage)
})

describe('createQuantityQueue', () => {
  it('two quick taps are two sums with their own ids and optimistic totals', () => {
    const send = vi.fn<Send>(never)
    const q = createQuantityQueue(send, ids)
    expect(q.add('h1', 250)).toEqual({ entryId: 'q1', optimisticTotal: 250 })
    expect(q.add('h1', 250)).toEqual({ entryId: 'q2', optimisticTotal: 500 })
    expect(send.mock.calls).toEqual([
      ['h1', 'q1', 250],
      ['h1', 'q2', 250],
    ])
  })

  it('retries a retryable failure with the same entry id', async () => {
    const send = vi.fn<Send>().mockResolvedValueOnce({ ok: false, error: 'x', retry: true }).mockResolvedValue(OK(250))
    const q = createQuantityQueue(send, ids)
    q.add('h1', 250)
    await q.flush()
    expect(send.mock.calls).toEqual([
      ['h1', 'q1', 250],
      ['h1', 'q1', 250],
    ])
    expect(q.pending()).toEqual([])
  })

  it('keeps a retryable failure pending', async () => {
    vi.useFakeTimers()
    const send = vi.fn<Send>().mockResolvedValue(NET)
    const q = createQuantityQueue(send, ids)
    q.add('h1', 250)
    await vi.advanceTimersByTimeAsync(0)
    expect(q.pending()).toEqual([{ entryId: 'q1', habitId: 'h1', amount: 250 }])
    vi.useRealTimers()
  })

  it('drops a sum the server refuses', async () => {
    const send = vi.fn<Send>().mockResolvedValue(NO('Revisa la cantidad.'))
    const q = createQuantityQueue(send, ids)
    q.add('h1', 250)
    await q.flush()
    expect(q.pending()).toEqual([])
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('pending survives recreating the queue over the same sessionStorage', () => {
    const send = vi.fn<Send>(never)
    createQuantityQueue(send, ids).add('h1', 250)
    const again = createQuantityQueue(send, ids)
    expect(again.pending()).toEqual([{ entryId: 'q1', habitId: 'h1', amount: 250 }])
    expect(storage.getItem('kizuna:quantity-queue')).toContain('q1')
  })

  it('ignores corrupt stored data', () => {
    storage.setItem('kizuna:quantity-queue', '{nope')
    expect(createQuantityQueue(vi.fn<Send>(), ids).pending()).toEqual([])
    storage.setItem('kizuna:quantity-queue', JSON.stringify([{ entryId: 1 }, { entryId: 'a', habitId: 'h', amount: 5 }]))
    expect(createQuantityQueue(vi.fn<Send>(), ids).pending()).toEqual([{ entryId: 'a', habitId: 'h', amount: 5 }])
  })

  it('uses the server total as the new base for the next optimistic total', async () => {
    const send = vi.fn<Send>().mockResolvedValue(OK(1250))
    const q = createQuantityQueue(send, ids)
    q.setTotal('h1', 1000)
    expect(q.add('h1', 250).optimisticTotal).toBe(1250)
    await q.flush()
    expect(q.total('h1')).toBe(1250)
    expect(q.add('h1', 250).optimisticTotal).toBe(1500)
  })

  it('reports each settled send', async () => {
    const onSettled = vi.fn()
    const send = vi.fn<Send>().mockResolvedValue(OK(250))
    const q = createQuantityQueue(send, ids, { onSettled })
    q.add('h1', 250)
    await q.flush()
    expect(onSettled).toHaveBeenCalledWith({ entryId: 'q1', habitId: 'h1', amount: 250 }, OK(250))
  })
})

describe('shared storage', () => {
  it('two habits tapping alternately lose nothing, even from separate queues over one storage', () => {
    const a = createQuantityQueue(vi.fn<Send>(never), ids)
    const b = createQuantityQueue(vi.fn<Send>(never), ids)
    a.add('hA', 100)
    b.add('hB', 200)
    a.add('hA', 100)
    b.add('hB', 200)
    expect(a.pending().map((s) => s.habitId).sort()).toEqual(['hA', 'hA', 'hB', 'hB'])
    expect(b.pending()).toHaveLength(4)
  })

  it('two tabs: a queue re-reads storage, resends a sum it did not create, and does not resurrect settled ones', async () => {
    const a = createQuantityQueue(vi.fn<Send>(never), ids)
    a.add('h1', 250) // q1, never answered
    const sendB = vi.fn<Send>().mockResolvedValue(OK(250))
    const b = createQuantityQueue(sendB, ids)
    b.add('h2', 100) // q2
    await b.flush()
    expect(sendB.mock.calls.map((c) => c[1]).sort()).toEqual(['q1', 'q2'])
    expect(a.pending()).toEqual([])
  })

  it('sharedQuantityQueue is one queue per tab', () => {
    resetSharedQuantityQueue()
    const send = vi.fn<Send>(never)
    expect(sharedQuantityQueue(send, ids)).toBe(sharedQuantityQueue(send, ids))
    resetSharedQuantityQueue()
  })

  it('a refusal for a habit with no listener leaves a notice until it is taken', async () => {
    const q = createQuantityQueue(vi.fn<Send>().mockResolvedValue(NO('Revisa la cantidad.')), ids)
    q.add('h9', 5)
    await q.flush()
    expect(q.takeNotices('h1')).toEqual([])
    expect(q.takeNotices('h9')).toEqual([{ habitId: 'h9', entryId: 'q1', error: 'Revisa la cantidad.' }])
    expect(q.takeNotices('h9')).toEqual([])
  })
})

describe('burst with a rejection', () => {
  it('rolls back only the refused tap', async () => {
    const send = vi.fn<Send>(async (_h, id) => (id === 'q2' ? NO('Es demasiado para un día.') : OK(id === 'q1' ? 250 : 500)))
    const events: QueueEvent[] = []
    const q = createQuantityQueue(send, ids)
    q.subscribe((e) => events.push(e))
    q.add('h1', 250)
    q.add('h1', 250)
    q.add('h1', 250)
    expect(q.optimisticTotal('h1')).toBe(750)
    await q.flush()
    expect(q.pending()).toEqual([])
    expect(q.optimisticTotal('h1')).toBe(500)
    const refused = events.filter((e) => e.kind === 'settled' && !e.result.ok)
    expect(refused).toHaveLength(1)
    expect(refused[0]).toMatchObject({ sum: { entryId: 'q2' }, result: { error: 'Es demasiado para un día.' } })
    expect(events.at(-1)).toEqual({ kind: 'drained' })
  })
})

describe('offlineAfter (the offline line of a control)', () => {
  const sum = (habitId: string) => ({ entryId: 'e1', habitId, amount: 250 })
  const LINE = 'Sin conexión.'

  it('an offline event of this habit shows its line', () => {
    expect(offlineAfter(null, { kind: 'offline', sum: sum('h1'), error: LINE }, 'h1')).toBe(LINE)
  })

  it('any settled event of this habit clears it: accepted or refused by the server', () => {
    expect(offlineAfter(LINE, { kind: 'settled', sum: sum('h1'), result: OK(250) }, 'h1')).toBeNull()
    expect(offlineAfter(LINE, { kind: 'settled', sum: sum('h1'), result: NO('Es demasiado.') }, 'h1')).toBeNull()
  })

  it('the queue draining clears it', () => {
    expect(offlineAfter(LINE, { kind: 'drained' }, 'h1')).toBeNull()
  })

  it('events of another habit leave it alone', () => {
    expect(offlineAfter(LINE, { kind: 'offline', sum: sum('h2'), error: 'otra' }, 'h1')).toBe(LINE)
    expect(offlineAfter(LINE, { kind: 'settled', sum: sum('h2'), result: OK(1) }, 'h1')).toBe(LINE)
  })

  it('a retried tap that ends in a refusal clears the line the queue showed (end to end)', async () => {
    vi.useFakeTimers()
    try {
      const send = vi.fn<Send>().mockResolvedValueOnce(NET).mockResolvedValue(NO('Es demasiado para un día.'))
      const q = createQuantityQueue(send, ids)
      let line: string | null = null
      q.subscribe((e) => {
        line = offlineAfter(line, e, 'h1')
      })
      q.add('h1', 250)
      await vi.advanceTimersByTimeAsync(0)
      expect(line).toBe('Sin conexión.')
      await vi.advanceTimersByTimeAsync(1000)
      expect(line).toBeNull()
      expect(q.pending()).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('retry', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('a network failure then recovery sends the same id once more and then stops', async () => {
    const send = vi.fn<Send>().mockResolvedValueOnce(NET).mockResolvedValue(OK(250))
    const events: QueueEvent[] = []
    const q = createQuantityQueue(send, ids)
    q.subscribe((e) => events.push(e))
    q.add('h1', 250)
    await vi.advanceTimersByTimeAsync(0)
    expect(events[0]).toMatchObject({ kind: 'offline', error: 'Sin conexión.' })
    expect(q.pending()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(120000)
    expect(send.mock.calls).toEqual([
      ['h1', 'q1', 250],
      ['h1', 'q1', 250],
    ])
    expect(q.pending()).toEqual([])
  })

  it('a thrown send counts as a network failure and stays pending', async () => {
    const send = vi.fn<Send>().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(OK(250))
    const q = createQuantityQueue(send, ids)
    q.add('h1', 250)
    await vi.advanceTimersByTimeAsync(0)
    expect(q.pending()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(q.pending()).toEqual([])
  })

  it('backs off 1 s, 2 s, 4 s ... capped at 30 s', async () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(backoffDelay)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000])
    const send = vi.fn<Send>().mockResolvedValue(NET)
    const q = createQuantityQueue(send, ids)
    q.add('h1', 250)
    await vi.advanceTimersByTimeAsync(0)
    expect(send).toHaveBeenCalledTimes(1)
    let calls = 1
    for (const wait of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      await vi.advanceTimersByTimeAsync(wait - 1)
      expect(send).toHaveBeenCalledTimes(calls)
      await vi.advanceTimersByTimeAsync(1)
      calls += 1
      expect(send).toHaveBeenCalledTimes(calls)
    }
  })

  it('adding a tap also resends the stuck backlog', async () => {
    const send = vi.fn<Send>().mockResolvedValueOnce(NET).mockResolvedValue(OK(500))
    const q = createQuantityQueue(send, ids)
    q.add('h1', 250)
    await vi.advanceTimersByTimeAsync(0)
    q.add('h1', 250)
    await vi.advanceTimersByTimeAsync(0)
    expect(send.mock.calls.map((c) => c[1])).toEqual(['q1', 'q2', 'q1'])
    expect(q.pending()).toEqual([])
  })

  it('never sends the same entry id twice at the same time (add backlog, retry timer, flush)', async () => {
    const active = new Map<string, number>()
    let maxConcurrent = 0
    let q1Sends = 0
    const send = vi.fn<Send>(async (_h, id) => {
      if (id === 'q1') q1Sends += 1
      const first = id === 'q1' && q1Sends === 1
      active.set(id, (active.get(id) ?? 0) + 1)
      maxConcurrent = Math.max(maxConcurrent, active.get(id)!)
      await new Promise((r) => setTimeout(r, 1500))
      active.set(id, active.get(id)! - 1)
      return first ? NET : OK(1000)
    })
    const q = createQuantityQueue(send, ids)
    q.add('h1', 250) // q1: slow, then a network failure
    q.add('h1', 250) // q2 while q1 is in flight: the add backlog must skip q1
    q.add('h1', 250)
    void q.flush()
    await vi.advanceTimersByTimeAsync(1500) // q1 fails, retry timer armed for 1 s
    await vi.advanceTimersByTimeAsync(1000) // timer flushes: q1 is idle, q2/q3 are done or in flight
    q.add('h1', 250)
    void q.flush()
    await vi.advanceTimersByTimeAsync(10000)
    expect(maxConcurrent).toBe(1)
    expect(q.pending()).toEqual([])
  })

  it('flushes on online and when the page becomes visible', () => {
    const flush = vi.fn(async () => {})
    const win = new EventTarget()
    const doc = Object.assign(new EventTarget(), { visibilityState: 'hidden' })
    const off = attachQuantityQueueTriggers({ flush }, win, doc)
    win.dispatchEvent(new Event('online'))
    expect(flush).toHaveBeenCalledTimes(1)
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(flush).toHaveBeenCalledTimes(1)
    doc.visibilityState = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(flush).toHaveBeenCalledTimes(2)
    off()
    win.dispatchEvent(new Event('online'))
    expect(flush).toHaveBeenCalledTimes(2)
  })
})

describe('goal and reload', () => {
  it('goal met flips only on the confirmed total', async () => {
    let release: (v: ReturnType<typeof OK>) => void = () => {}
    const send = vi.fn<Send>(() => new Promise((r) => (release = r)))
    const q = createQuantityQueue(send, ids)
    q.setTotal('h1', 1750)
    q.add('h1', 250)
    expect(q.optimisticTotal('h1')).toBe(2000)
    expect(goalMet(q.total('h1'), 2000)).toBe(false)
    release(OK(2000))
    await q.flush()
    expect(goalMet(q.total('h1'), 2000)).toBe(true)
    expect(goalMet(0, 2000, true)).toBe(true)
  })

  it('reload with a pending tap the server already applied does not double count', () => {
    createQuantityQueue(vi.fn<Send>(never), ids).add('h1', 250) // q1 stored, answer lost
    const again = createQuantityQueue(vi.fn<Send>(never), ids)
    again.setTotal('h1', 250, ['q1']) // the refreshed page already includes q1
    expect(again.optimisticTotal('h1')).toBe(250)
    expect(again.pending()).toEqual([])
  })

  it('reload with a tap the server has not seen counts it once', () => {
    createQuantityQueue(vi.fn<Send>(never), ids).add('h1', 250)
    const again = createQuantityQueue(vi.fn<Send>(never), ids)
    again.setTotal('h1', 1000, ['other'])
    expect(again.optimisticTotal('h1')).toBe(1250)
  })
})

describe('newEntryId', () => {
  const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  it('uses randomUUID when it exists', () => {
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' })
    expect(newEntryId()).toBe('11111111-1111-4111-8111-111111111111')
  })
  it('falls back to getRandomValues, and to Math.random without crypto', () => {
    vi.stubGlobal('crypto', { getRandomValues: (b: Uint8Array) => b.fill(7) })
    expect(newEntryId()).toMatch(V4)
    vi.stubGlobal('crypto', undefined)
    expect(newEntryId()).toMatch(V4)
  })
})

const cfg = (over: Partial<QuantityConfig>): QuantityConfig => ({
  unit: 'ml',
  label: null,
  target: 2000,
  step: 250,
  display: 'base',
  glassMl: 250,
  ...over,
})

const WHOLE = 'Usa números enteros, por ejemplo 1250.'
const AMBIGUOUS = '¿Mil o decimal? Escribe 1250 o 1,25.'
const INVALID = 'Revisa la cantidad.'
const ok = (amount: number) => ({ ok: true, amount })
const bad = (error: string) => ({ ok: false, error })

const groups: Record<string, QuantityConfig> = {
  ml: cfg({}),
  steps: cfg({ unit: 'steps' }),
  times: cfg({ unit: 'times', target: 3, step: 1 }),
  minutes: cfg({ unit: 'minutes', target: 30, step: 10 }),
  km: cfg({ unit: 'km', target: 5, step: 1 }),
  custom: cfg({ unit: 'custom', label: 'páginas', target: 100, step: 10 }),
  glasses: cfg({ display: 'glasses' }),
}
const wholeUnits = ['ml', 'steps', 'times', 'minutes']
const decimalUnits = ['km', 'custom']

describe('parseTypedAmountResult', () => {
  it.each(wholeUnits)('whole-number unit %s: digits and valid thousands dots only', (u) => {
    const c = groups[u]
    expect(parseTypedAmountResult('250', c)).toEqual(ok(250))
    expect(parseTypedAmountResult('1.250', c)).toEqual(ok(1250))
    expect(parseTypedAmountResult('12.500', c)).toEqual(ok(12500))
    expect(parseTypedAmountResult('1.250,0', c)).toEqual(bad(WHOLE))
    expect(parseTypedAmountResult('1.5', c)).toEqual(bad(WHOLE))
    expect(parseTypedAmountResult('1,5', c)).toEqual(bad(WHOLE))
    expect(parseTypedAmountResult('1,250', c)).toEqual(bad(WHOLE))
    expect(parseTypedAmountResult('0.500', c)).toEqual(bad(WHOLE))
    expect(parseTypedAmountResult('12.50.0', c)).toEqual(bad(INVALID))
    expect(parseTypedAmountResult('12.50', c)).toEqual(bad(WHOLE))
    expect(parseTypedAmountResult('1.250.000', c)).toEqual(bad(INVALID)) // over the day limit
  })

  it.each(decimalUnits)('decimal unit %s: one dot + 1-2 digits is a decimal, 3 digits is ambiguous', (u) => {
    const c = groups[u]
    expect(parseTypedAmountResult('5', c)).toEqual(ok(5))
    expect(parseTypedAmountResult('1.5', c)).toEqual(ok(1.5))
    expect(parseTypedAmountResult('2.25', c)).toEqual(ok(2.25))
    expect(parseTypedAmountResult('3.0', c)).toEqual(ok(3))
    expect(parseTypedAmountResult('10.000', c)).toEqual(bad(AMBIGUOUS))
    expect(parseTypedAmountResult('2.000', c)).toEqual(bad(AMBIGUOUS))
    expect(parseTypedAmountResult('1.250', c)).toEqual(bad(AMBIGUOUS))
    expect(parseTypedAmountResult('0.500', c)).toEqual(bad(AMBIGUOUS))
    expect(parseTypedAmountResult('1.2500', c)).toEqual(bad(INVALID))
    expect(parseTypedAmountResult('1.250.000', c)).toEqual(bad(INVALID))
    expect(parseTypedAmountResult('1.2.5', c)).toEqual(bad(INVALID))
  })

  it.each([...decimalUnits, 'glasses'])('%s: a comma is the decimal separator, dots before it are thousands', (u) => {
    const c = groups[u]
    const f = (n: number) => (u === 'glasses' ? Math.round(n * 250) : n)
    expect(parseTypedAmountResult('1,5', c)).toEqual(ok(f(1.5)))
    expect(parseTypedAmountResult('1,25', c)).toEqual(ok(f(1.25)))
    expect(parseTypedAmountResult('1,250', c)).toEqual(ok(f(1.25)))
    expect(parseTypedAmountResult('1,255', c)).toEqual(bad(INVALID))
    // 1250,5 vasos is over the 100.000 base-unit day limit; the units without a conversion accept it
    expect(parseTypedAmountResult('1.250,5', c)).toEqual(u === 'glasses' ? bad(INVALID) : ok(1250.5))
    expect(parseTypedAmountResult('12.50,5', c)).toEqual(bad(INVALID))
    expect(parseTypedAmountResult('1,5,5', c)).toEqual(bad(INVALID))
  })

  it('glasses behave as a decimal unit and convert to ml', () => {
    const c = groups.glasses
    expect(parseTypedAmountResult('1.5', c)).toEqual(ok(375))
    expect(parseTypedAmountResult('2', c)).toEqual(ok(500))
    expect(parseTypedAmountResult('1.250', c)).toEqual(bad(AMBIGUOUS))
  })

  it.each(Object.keys(groups))('%s: letters, signs, empty and zero use the invalid copy', (u) => {
    const c = groups[u]
    for (const raw of ['', '  ', 'abc', '-5', '+5', '1e3', '1 000', '0', '0,0', ',', '.', '1.', '.5']) {
      expect(parseTypedAmountResult(raw, c), `${u}: "${raw}"`).toMatchObject({ ok: false })
    }
    for (const raw of ['abc', '-5', '', '0']) expect(parseTypedAmountResult(raw, c)).toEqual(bad(INVALID))
  })

  it('parseTypedAmount is the number-or-null view of the result', () => {
    expect(parseTypedAmount('1.250', groups.ml)).toBe(1250)
    expect(parseTypedAmount('1.250', groups.km)).toBeNull()
  })
})

describe('doneAfterSync', () => {
  it('forgets the server done flag when the confirmed total drops below the goal', () => {
    expect(doneAfterSync(true, 1750, 2000)).toBe(false)
    expect(doneAfterSync(true, 2000, 2000)).toBe(true)
    expect(doneAfterSync(false, 2500, 2000)).toBe(false)
  })
})

describe('resolveTarget (locked goal)', () => {
  it('does not clamp: a goal below the locked value becomes NaN so the draft is refused', () => {
    const c = cfg({ unit: 'steps', target: 8000, step: 1000 })
    expect(resolveTarget('5.000', c, 8000)).toBeNaN()
    expect(resolveTarget('8.000', c, 8000)).toBe(8000)
    expect(resolveTarget('9000', c, 8000)).toBe(9000)
    expect(resolveTarget('5000', c, null)).toBe(5000)
    expect(resolveTarget('abc', c, 8000)).toBeNaN()
    expect(validateQuantityConfig({ ...c, target: resolveTarget('5000', c, 8000) }).ok).toBe(false)
  })
})
