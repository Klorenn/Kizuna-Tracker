import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQuantityQueue } from '@/lib/quantity-queue'

type Send = Parameters<typeof createQuantityQueue>[0]
const OK = (total: number) => ({ ok: true as const, total, target: 2000, done: false })

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

beforeEach(() => {
  storage = new MemoryStorage()
  n = 0
  vi.stubGlobal('sessionStorage', storage)
})

describe('createQuantityQueue', () => {
  it('two quick taps are two sums with their own ids and optimistic totals', () => {
    const send = vi.fn<Send>(() => new Promise(() => {}))
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
    const send = vi.fn<Send>().mockResolvedValue({ ok: false, error: 'x', retry: true })
    const q = createQuantityQueue(send, ids)
    q.add('h1', 250)
    await Promise.resolve()
    expect(q.pending()).toEqual([{ entryId: 'q1', habitId: 'h1', amount: 250 }])
  })

  it('drops a sum the server refuses', async () => {
    const send = vi.fn<Send>().mockResolvedValue({ ok: false, error: 'Revisa la cantidad.', retry: false })
    const q = createQuantityQueue(send, ids)
    q.add('h1', 250)
    await q.flush()
    expect(q.pending()).toEqual([])
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('pending survives recreating the queue over the same sessionStorage', () => {
    const send = vi.fn<Send>(() => new Promise(() => {}))
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
