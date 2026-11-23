import { describe, expect, it, vi } from 'vitest'
import { initialPomodoro, type PomodoroState } from '@/domain/pomodoro'
import { canOfferNotifications } from '@/lib/pomodoro-alerts'
import { flushPending } from '@/lib/pomodoro-sync'

type Send = Parameters<typeof flushPending>[1]

const config = { focusMin: 25, breakMin: 5, cycles: 4 }
const withPending = (...ids: string[]): PomodoroState => ({
  ...initialPomodoro('h1', config),
  pending: ids.map((blockId, i) => ({ blockId, minutes: 25, endedAt: 1000 + i })),
})
const ok: Awaited<ReturnType<Send>> = { ok: true, credited: true, totalMinutes: 25 }

describe('flushPending', () => {
  it('confirms every block the server accepted', async () => {
    const send = vi.fn<Send>(async () => ok)
    expect(await flushPending(withPending('b1', 'b2'), send, null)).toEqual([
      { type: 'confirm', blockId: 'b1' },
      { type: 'confirm', blockId: 'b2' },
    ])
    expect(send).toHaveBeenCalledWith('h1', { blockId: 'b1', minutes: 25 }, null)
  })

  it('a retryable failure stays pending (no event)', async () => {
    const send = vi.fn<Send>(async (_h, b) => (b.blockId === 'b1' ? { ok: false, error: 'red', retry: true } : ok))
    expect(await flushPending(withPending('b1', 'b2'), send, null)).toEqual([{ type: 'confirm', blockId: 'b2' }])
  })

  it('a final failure drops the block', async () => {
    const send = vi.fn<Send>(async (_h, b) =>
      b.blockId === 'b1' ? { ok: false, error: 'Este hábito ya no lleva tiempo.', retry: false } : ok,
    )
    expect(await flushPending(withPending('b1', 'b2'), send, null)).toEqual([
      { type: 'drop', blockId: 'b1' },
      { type: 'confirm', blockId: 'b2' },
    ])
  })

  it('a throwing send is a retry', async () => {
    const send = vi.fn<Send>(async () => {
      throw new TypeError('fetch failed')
    })
    expect(await flushPending(withPending('b1'), send, null)).toEqual([])
  })

  it('never sends a block that is already in flight', async () => {
    const resolvers: ((r: Awaited<ReturnType<Send>>) => void)[] = []
    const send = vi.fn<Send>(() => new Promise((res) => resolvers.push(res)))
    const state = withPending('b1', 'b2')
    const first = flushPending(state, send, null)
    const second = flushPending(state, send, null)
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
    await flushPending(withPending('b1'), send, null)
    await flushPending(withPending('b1'), send, null)
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
