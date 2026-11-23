import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  attachQuantityQueueTriggers,
  backoffDelay,
  createQuantityQueue,
  goalMet,
  newEntryId,
  parseTypedAmount,
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

  it('does not send an id that is already in flight', async () => {
    const send = vi.fn<Send>(never)
    const q = createQuantityQueue(send, ids)
    q.add('h1', 250)
    q.add('h1', 250)
    void q.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(send).toHaveBeenCalledTimes(2)
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

describe('parseTypedAmount', () => {
  it('reads "." as thousands for whole-number units', () => {
    expect(parseTypedAmount('1.250', cfg({}))).toBe(1250)
    expect(parseTypedAmount('12.500', cfg({ unit: 'steps' }))).toBe(12500)
    expect(parseTypedAmount('1.250.000', cfg({ unit: 'steps' }))).toBeNull() // over the day limit
    expect(parseTypedAmount('250', cfg({}))).toBe(250)
  })
  it('refuses decimals and malformed groups for whole-number units', () => {
    expect(parseTypedAmount('1.5', cfg({}))).toBeNull()
    expect(parseTypedAmount('1.25', cfg({}))).toBeNull()
    expect(parseTypedAmount('1,5', cfg({}))).toBeNull()
    expect(parseTypedAmount('12.50.0', cfg({}))).toBeNull()
  })
  it('reads "." as a decimal point for km and custom units (trailing zeros dropped)', () => {
    expect(parseTypedAmount('1.5', cfg({ unit: 'km' }))).toBe(1.5)
    expect(parseTypedAmount('1.250', cfg({ unit: 'km' }))).toBe(1.25)
    expect(parseTypedAmount('1.255', cfg({ unit: 'km' }))).toBeNull()
    expect(parseTypedAmount('2.5', cfg({ unit: 'custom', label: 'páginas' }))).toBe(2.5)
    expect(parseTypedAmount('3.0', cfg({ unit: 'km' }))).toBe(3)
  })
  it('comma is always the decimal separator and dots before it are thousands', () => {
    expect(parseTypedAmount('1,5', cfg({ unit: 'km' }))).toBe(1.5)
    expect(parseTypedAmount('1.250,5', cfg({ unit: 'km' }))).toBe(1250.5)
  })
  it('glasses are decimal: "1.5" vasos is 375 ml', () => {
    expect(parseTypedAmount('1.5', cfg({ display: 'glasses' }))).toBe(375)
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
