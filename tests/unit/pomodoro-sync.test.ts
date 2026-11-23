import { describe, expect, it, vi } from 'vitest'
import { initialPomodoro, type PomodoroState } from '@/domain/pomodoro'
import { canOfferNotifications } from '@/lib/pomodoro-alerts'
import {
  backoffMs,
  blockIsExpired,
  createRetryScheduler,
  expiredMessage,
  flushPending,
  flushPendingDetailed,
  reportLines,
} from '@/lib/pomodoro-sync'


type Send = Parameters<typeof flushPending>[1]

const config = { focusMin: 25, breakMin: 5, cycles: 4 }
const withPending = (...ids: string[]): PomodoroState => ({
  ...initialPomodoro('h1', config),
  pending: ids.map((blockId, i) => ({ blockId, minutes: 25, endedAt: 1000 + i })),
})
const ok: Awaited<ReturnType<Send>> = { ok: true, credited: true, totalMinutes: 25 }
// the stored blocks of these tests end at 1970-01-01: this is a moment of that same day
const DAY0 = { timeZone: 'UTC', now: 1500 }

describe('flushPending', () => {
  it('confirms every block the server accepted', async () => {
    const send = vi.fn<Send>(async () => ok)
    expect(await flushPending(withPending('b1', 'b2'), send, null, DAY0)).toEqual([
      { type: 'confirm', blockId: 'b1' },
      { type: 'confirm', blockId: 'b2' },
    ])
    expect(send).toHaveBeenCalledWith('h1', { blockId: 'b1', minutes: 25, endedAt: 1000 }, null)
    expect(send).toHaveBeenCalledWith('h1', { blockId: 'b2', minutes: 25, endedAt: 1001 }, null)
  })

  it('a retry sends the same block id and end instant again', async () => {
    const send = vi.fn<Send>(async () => ({ ok: false, error: 'red', retry: true }))
    const state = withPending('b1')
    await flushPending(state, send, null, DAY0)
    await flushPending(state, send, null, DAY0)
    expect(send).toHaveBeenNthCalledWith(1, 'h1', { blockId: 'b1', minutes: 25, endedAt: 1000 }, null)
    expect(send).toHaveBeenNthCalledWith(2, 'h1', { blockId: 'b1', minutes: 25, endedAt: 1000 }, null)
  })

  it('the resend without the topic keeps the block id and the end instant', async () => {
    const send = vi.fn<Send>(async (_h, _b, topic) =>
      topic === null ? ok : { ok: false, error: 'tema', retry: false, code: 'invalid_topic' },
    )
    await flushPending(withPending('b1'), send, 'x'.repeat(61), DAY0)
    expect(send).toHaveBeenNthCalledWith(1, 'h1', { blockId: 'b1', minutes: 25, endedAt: 1000 }, 'x'.repeat(61))
    expect(send).toHaveBeenNthCalledWith(2, 'h1', { blockId: 'b1', minutes: 25, endedAt: 1000 }, null)
  })

  it('a block restored without endedAt (older stored shape) is dropped as expired, never sent', async () => {
    const send = vi.fn<Send>(async () => ok)
    const legacy = {
      ...initialPomodoro('h1', config),
      pending: [{ blockId: 'old', minutes: 25 }],
    } as unknown as PomodoroState
    const report = await flushPendingDetailed(legacy, send, null, DAY0)
    expect(report.events).toEqual([{ type: 'drop', blockId: 'old' }])
    expect(report.expired).toBe(1)
    expect(send).not.toHaveBeenCalled()
  })
  it('a retryable failure stays pending (no event)', async () => {
    const send = vi.fn<Send>(async (_h, b) => (b.blockId === 'b1' ? { ok: false, error: 'red', retry: true } : ok))
    expect(await flushPending(withPending('b1', 'b2'), send, null, DAY0)).toEqual([{ type: 'confirm', blockId: 'b2' }])
  })

  it('a final failure drops the block', async () => {
    const send = vi.fn<Send>(async (_h, b) =>
      b.blockId === 'b1' ? { ok: false, error: 'Este hábito ya no lleva tiempo.', retry: false } : ok,
    )
    expect(await flushPending(withPending('b1', 'b2'), send, null, DAY0)).toEqual([
      { type: 'drop', blockId: 'b1' },
      { type: 'confirm', blockId: 'b2' },
    ])
  })

  it('a throwing send is a retry', async () => {
    const send = vi.fn<Send>(async () => {
      throw new TypeError('fetch failed')
    })
    expect(await flushPending(withPending('b1'), send, null, DAY0)).toEqual([])
  })

  it('never sends a block that is already in flight', async () => {
    const resolvers: ((r: Awaited<ReturnType<Send>>) => void)[] = []
    const send = vi.fn<Send>(() => new Promise((res) => resolvers.push(res)))
    const state = withPending('b1', 'b2')
    const first = flushPending(state, send, null, DAY0)
    const second = flushPending(state, send, null, DAY0)
    expect(await second).toEqual([])
    expect(send.mock.calls.map((c) => c[1].blockId)).toEqual(['b1', 'b2'])
    for (const r of resolvers) r(ok)
    expect(await first).toEqual([
      { type: 'confirm', blockId: 'b1' },
      { type: 'confirm', blockId: 'b2' },
    ])
  })

  it('a block can be sent again after its attempt finished', async () => {
    const send = vi.fn<Send>(async () => ({ ok: false, error: 'red', retry: true }))
    await flushPending(withPending('b1'), send, null, DAY0)
    await flushPending(withPending('b1'), send, null, DAY0)
    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe('canOfferNotifications', () => {
  const env = { hasNotification: true, permission: 'default' as const, isIOS: false, standalone: false }
  it('offers on desktop and Android while the permission is undecided', () => {
    expect(canOfferNotifications(env)).toBe(true)
  })
  it('iOS needs the installed app', () => {
    expect(canOfferNotifications({ ...env, isIOS: true })).toBe(false)
    expect(canOfferNotifications({ ...env, isIOS: true, standalone: true })).toBe(true)
  })
  it('does not offer what is already granted or denied', () => {
    expect(canOfferNotifications({ ...env, permission: 'granted' })).toBe(false)
    expect(canOfferNotifications({ ...env, permission: 'denied' })).toBe(false)
  })
  it('does not offer without Notification', () => {
    expect(canOfferNotifications({ ...env, hasNotification: false, permission: null })).toBe(false)
  })
})

const at = (iso: string) => Date.parse(iso)

describe('blockIsExpired (a block counts only for the local day it ended on)', () => {
  it('same local day: not expired', () => {
    expect(blockIsExpired(at('2026-11-22T15:00:00Z'), at('2026-11-22T20:00:00Z'), 'UTC')).toBe(false)
  })

  it('one second after local midnight: expired', () => {
    // Santiago is UTC-3 in November: local midnight of the 23rd is 03:00:00Z
    const ended = at('2026-11-23T02:59:59Z')
    expect(blockIsExpired(ended, at('2026-11-23T02:59:59Z'), 'America/Santiago')).toBe(false)
    expect(blockIsExpired(ended, at('2026-11-23T03:00:00Z'), 'America/Santiago')).toBe(true)
  })

  it('west of UTC: the zone, not UTC, draws the line', () => {
    // 02:59:59Z -> 03:00:00Z crosses Santiago midnight but not the UTC one
    expect(blockIsExpired(at('2026-11-23T02:59:59Z'), at('2026-11-23T03:00:00Z'), 'UTC')).toBe(false)
  })

  it('east of UTC: Tokyo midnight is 15:00Z', () => {
    const ended = at('2026-11-22T14:59:59Z')
    expect(blockIsExpired(ended, at('2026-11-22T14:59:59Z'), 'Asia/Tokyo')).toBe(false)
    expect(blockIsExpired(ended, at('2026-11-22T15:00:00Z'), 'Asia/Tokyo')).toBe(true)
  })

  it('a clock moved backwards is never expired', () => {
    expect(blockIsExpired(at('2026-11-23T10:00:00Z'), at('2026-11-22T10:00:00Z'), 'UTC')).toBe(false)
  })

  it('days later is expired in any zone', () => {
    expect(blockIsExpired(at('2026-11-20T12:00:00Z'), at('2026-11-23T12:00:00Z'), 'Asia/Tokyo')).toBe(true)
  })

  it('the one-line copy and its plural', () => {
    expect(expiredMessage(1)).toBe('Un bloque terminó ayer y ya no se puede sumar.')
    expect(expiredMessage(3)).toBe('3 bloques terminaron ayer y ya no se pueden sumar.')
  })
})

describe('flushPendingDetailed', () => {
  const NOW = at('2026-11-23T12:00:00Z')
  const day = { timeZone: 'UTC', now: NOW }
  const pendingAt = (blockId: string, endedAt: number): PomodoroState => ({
    ...initialPomodoro('h1', config),
    pending: [{ blockId, minutes: 25, endedAt }],
  })

  it('sends a block from today', async () => {
    const send = vi.fn<Send>(async () => ok)
    const r = await flushPendingDetailed(pendingAt('new', at('2026-11-23T11:00:00Z')), send, null, day)
    expect(send).toHaveBeenCalledTimes(1)
    expect(r.expired).toBe(0)
    expect(r.totalMinutes).toBe(25)
  })

  it('reports the refused block with its message', async () => {
    const send = vi.fn<Send>(async () => ({ ok: false, error: 'Este hábito ya no lleva tiempo.', retry: false, code: 'log_type_mismatch' }))
    const r = await flushPendingDetailed(withPending('b1'), send, null, DAY0)
    expect(r.dropped).toEqual([{ blockId: 'b1', minutes: 25, message: 'Este hábito ya no lleva tiempo. No guardamos 25 min.' }])
  })

  it('a server block_expired is dropped with the same one-line message', async () => {
    const send = vi.fn<Send>(async () => ({
      ok: false,
      error: 'Un bloque terminó ayer y ya no se puede sumar.',
      retry: false,
      code: 'block_expired',
    }))
    const r = await flushPendingDetailed(withPending('b1'), send, null, DAY0)
    expect(r.events).toEqual([{ type: 'drop', blockId: 'b1' }])
    expect(r.dropped[0].message).toBe('Un bloque terminó ayer y ya no se puede sumar.')
  })

  it('a rejected topic costs only the topic: resent once without it', async () => {
    const send = vi.fn<Send>(async (_h, _b, topic) =>
      topic === null ? ok : { ok: false, error: 'El tema tiene hasta 60 caracteres.', retry: false, code: 'invalid_topic' },
    )
    const r = await flushPendingDetailed(withPending('b1'), send, 'Álgebra', DAY0)
    expect(send.mock.calls.map((c) => c[2])).toEqual(['Álgebra', null])
    expect(r.events).toEqual([{ type: 'confirm', blockId: 'b1' }])
    expect(r.topicRejected).toBe(true)
  })

  it('a lost session keeps the block and flags it', async () => {
    const send = vi.fn<Send>(async () => ({ ok: false, error: 'Inicia sesión para guardar tus bloques.', retry: true, code: 'not_authenticated' }))
    const r = await flushPendingDetailed(withPending('b1'), send, null, DAY0)
    expect(r.events).toEqual([])
    expect(r.retryable).toBe(1)
    expect(r.signedOut).toBe(true)
  })
})

describe('flushPendingDetailed: connection trouble and blocks already credited', () => {
  const NOW = at('2026-11-23T12:00:00Z')
  const day = { timeZone: 'UTC', now: NOW }
  const pendingAt = (blockId: string, endedAt: number): PomodoroState => ({
    ...initialPomodoro('h1', config),
    pending: [{ blockId, minutes: 25, endedAt }],
  })

  it('a failed session check keeps the block and flags the connection, not a sign-in', async () => {
    const send = vi.fn<Send>(async () => ({
      ok: false,
      error: 'No pudimos conectar. Inténtalo de nuevo en unos minutos.',
      retry: true,
      code: 'session_unavailable',
    }))
    const r = await flushPendingDetailed(pendingAt('u1', at('2026-11-23T11:00:00Z')), send, null, day)
    expect(r.events).toEqual([])
    expect(r.retryable).toBe(1)
    expect(r.signedOut).toBe(false)
    expect(r.unreachable).toBe(true)
  })

  describe('a block whose local day is over is still sent once: the server is the authority', () => {
    const ended = at('2026-11-22T23:50:00Z')
    const nextDay = { timeZone: 'UTC', now: at('2026-11-23T09:00:00Z') }

    it('the server already has the receipt (answers ok): confirmed as credited, nothing shown as lost', async () => {
      const send = vi.fn<Send>(async () => ({ ok: true, credited: false, totalMinutes: 50 }))
      const r = await flushPendingDetailed(pendingAt('late-ok', ended), send, null, nextDay)
      expect(send).toHaveBeenCalledTimes(1)
      expect(r.events).toEqual([{ type: 'confirm', blockId: 'late-ok' }])
      expect(r.expired).toBe(0)
      expect(r.late).toBe(1)
      expect(r.dropped).toEqual([])
      expect(r.totalMinutes).toBe(50)
      expect(reportLines(r)).toEqual([])
    })

    it('the server refuses it (block_expired): it leaves the queue with the "terminó ayer" line', async () => {
      const send = vi.fn<Send>(async () => ({
        ok: false,
        error: 'Un bloque terminó ayer y ya no se puede sumar.',
        retry: false,
        code: 'block_expired',
      }))
      const r = await flushPendingDetailed(pendingAt('late-no', ended), send, null, nextDay)
      expect(send).toHaveBeenCalledTimes(1)
      expect(r.events).toEqual([{ type: 'drop', blockId: 'late-no' }])
      expect(reportLines(r)).toEqual(['Un bloque terminó ayer y ya no se puede sumar.'])
    })

    it('a network failure keeps it for the normal retry schedule', async () => {
      const send = vi.fn<Send>(async () => ({ ok: false, error: '', retry: true }))
      const r = await flushPendingDetailed(pendingAt('late-net', ended), send, null, nextDay)
      expect(send).toHaveBeenCalledTimes(1)
      expect(r.events).toEqual([])
      expect(r.retryable).toBe(1)
      expect(r.expired).toBe(0)
    })

    it('a block without its end instant cannot be sent: expired locally', async () => {
      const send = vi.fn<Send>(async () => ok)
      const legacy = { ...pendingAt('legacy', ended), pending: [{ blockId: 'legacy', minutes: 25 } as never] }
      const r = await flushPendingDetailed(legacy, send, null, nextDay)
      expect(send).not.toHaveBeenCalled()
      expect(r.expired).toBe(1)
    })
  })

})

describe('reportLines', () => {
  const base = {
    events: [],
    dropped: [],
    expired: 0,
    totalMinutes: null,
    topicRejected: false,
    retryable: 0,
    signedOut: false,
    unreachable: false,
    late: 0,
  }
  it('says nothing when there is nothing to say', () => {
    expect(reportLines(base)).toEqual([])
  })
  it('a failed session check says it could not connect, a lost session says to sign in', () => {
    expect(reportLines({ ...base, unreachable: true })).toEqual(['No pudimos conectar. Inténtalo de nuevo en unos minutos.'])
    expect(reportLines({ ...base, signedOut: true })).toEqual(['Inicia sesión para guardar tus bloques.'])
  })
  it('keeps the order: expired, refused, topic, session', () => {
    const lines = reportLines({
      ...base,
      expired: 2,
      dropped: [{ blockId: 'b', minutes: 25, message: 'Refused.' }],
      topicRejected: true,
      unreachable: true,
    })
    expect(lines).toEqual([
      '2 bloques terminaron ayer y ya no se pueden sumar.',
      'Refused.',
      'No guardamos el tema, pero sí los minutos.',
      'No pudimos conectar. Inténtalo de nuevo en unos minutos.',
    ])
  })
})

describe('retry schedule (I-2)', () => {
  it('doubles from 1 s and caps at 30 s', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000])
  })

  it('kick runs now, then waits the backoff while work remains, and rests when done', async () => {
    const timers: { fn: () => void; ms: number }[] = []
    let remaining = 4
    const run = vi.fn(async () => --remaining > 0)
    const s = createRetryScheduler({
      run,
      setTimer: (fn, ms) => (timers.push({ fn, ms }), timers.length),
      clearTimer: () => {},
    })
    s.kick()
    await vi.waitFor(() => expect(timers).toHaveLength(1))
    expect(run).toHaveBeenCalledTimes(1)
    for (let i = 0; i < 2; i++) {
      timers[i].fn()
      await vi.waitFor(() => expect(timers).toHaveLength(i + 2))
    }
    expect(timers.map((t) => t.ms)).toEqual([1000, 2000, 4000])
    timers[2].fn()
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(4))
    await Promise.resolve()
    expect(timers).toHaveLength(3)
    expect(s.failures()).toBe(0)
  })

  it('does not start a second run while one is in progress', async () => {
    let release: (more: boolean) => void = () => {}
    const run = vi.fn(() => new Promise<boolean>((res) => (release = res)))
    const s = createRetryScheduler({ run, setTimer: () => 1, clearTimer: () => {} })
    s.kick()
    s.kick()
    expect(run).toHaveBeenCalledTimes(1)
    release(false)
  })

  it('a kick during a run is not lost: it runs right after, once, however many arrived', async () => {
    const releases: ((more: boolean) => void)[] = []
    const run = vi.fn(() => new Promise<boolean>((res) => releases.push(res)))
    const timers: number[] = []
    const s = createRetryScheduler({ run, setTimer: (_fn, ms) => (timers.push(ms), 1), clearTimer: () => {} })
    s.kick()
    s.kick()
    s.kick()
    expect(run).toHaveBeenCalledTimes(1)
    releases[0](false)
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2))
    // the queued run starts at once (no backoff wait), and nothing else was queued behind it
    expect(timers).toEqual([])
    releases[1](false)
    await Promise.resolve()
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('a queued kick still runs when the run it waited for asked to retry', async () => {
    const releases: ((more: boolean) => void)[] = []
    const run = vi.fn(() => new Promise<boolean>((res) => releases.push(res)))
    const s = createRetryScheduler({ run, setTimer: () => 1, clearTimer: () => {} })
    s.kick()
    s.kick()
    releases[0](true)
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2))
  })

  it('stop() drops a queued kick', async () => {
    const releases: ((more: boolean) => void)[] = []
    const run = vi.fn(() => new Promise<boolean>((res) => releases.push(res)))
    const s = createRetryScheduler({ run, setTimer: () => 1, clearTimer: () => {} })
    s.kick()
    s.kick()
    s.stop()
    releases[0](false)
    await Promise.resolve()
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('stopwatch blocks', () => {
  const watch = (): PomodoroState => ({
    ...initialPomodoro('h1', config, 'stopwatch'),
    pending: [
      { blockId: 'a', minutes: 90, endedAt: 1000 },
      { blockId: 'b', minutes: 90, endedAt: 2000 },
      { blockId: 'c', minutes: 17, endedAt: 3000 },
    ],
  })

  it('sends each block once with its own id, minutes and end instant, and confirms each', async () => {
    const send = vi.fn<Send>(async () => ok)
    const events = await flushPending(watch(), send, 'Álgebra', DAY0)
    expect(send).toHaveBeenCalledTimes(3)
    expect(send).toHaveBeenCalledWith('h1', { blockId: 'a', minutes: 90, endedAt: 1000 }, 'Álgebra')
    expect(send).toHaveBeenCalledWith('h1', { blockId: 'b', minutes: 90, endedAt: 2000 }, 'Álgebra')
    expect(send).toHaveBeenCalledWith('h1', { blockId: 'c', minutes: 17, endedAt: 3000 }, 'Álgebra')
    expect(events).toEqual([
      { type: 'confirm', blockId: 'a' },
      { type: 'confirm', blockId: 'b' },
      { type: 'confirm', blockId: 'c' },
    ])
  })

  it('a retry reuses the ids and keeps only the blocks the network lost', async () => {
    const send = vi.fn<Send>(async (_h, b) => (b.blockId === 'b' ? { ok: false, error: 'red', retry: true } : ok))
    const first = await flushPendingDetailed(watch(), send, null, DAY0)
    expect(first.retryable).toBe(1)
    expect(first.events).toEqual([
      { type: 'confirm', blockId: 'a' },
      { type: 'confirm', blockId: 'c' },
    ])
    const left = { ...watch(), pending: watch().pending.filter((p) => p.blockId === 'b') }
    await flushPending(left, send, null, DAY0)
    expect(send).toHaveBeenLastCalledWith('h1', { blockId: 'b', minutes: 90, endedAt: 2000 }, null)
  })
})
