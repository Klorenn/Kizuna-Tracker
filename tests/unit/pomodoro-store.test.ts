import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialPomodoro, pomodoroReducer, type PomodoroState } from '@/domain/pomodoro'
import {
  activePomodoros,
  adoptRemote,
  loadPomodoro,
  pendingPomodoros,
  savePomodoro,
  sessionAfter,
  subscribePomodoro,
} from '@/lib/pomodoro-store'

class MemoryStorage implements Storage {
  private m = new Map<string, string>()
  get length() {
    return this.m.size
  }
  clear() {
    this.m.clear()
  }
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
}

const config = { focusMin: 25, breakMin: 5, cycles: 4 }
const NOW = 1_800_000_000_000
const HOUR = 3_600_000
const base = (habitId = 'h1'): PomodoroState => initialPomodoro(habitId, config)
const focus = (habitId = 'h1'): PomodoroState =>
  pomodoroReducer(base(habitId), { type: 'start', at: NOW, blockId: 'b1' })

let storage: MemoryStorage
beforeEach(() => {
  storage = new MemoryStorage()
})
afterEach(() => vi.unstubAllGlobals())

describe('savePomodoro / loadPomodoro', () => {
  it('round-trips under kizuna:pomodoro:<habitId>', () => {
    const s = focus()
    savePomodoro(s, storage)
    expect(storage.getItem('kizuna:pomodoro:h1')).not.toBeNull()
    expect(loadPomodoro('h1', storage, NOW)).toEqual(s)
  })

  it('returns null when nothing is stored', () => {
    expect(loadPomodoro('h1', storage, NOW)).toBeNull()
  })

  it('discards broken JSON and removes the key', () => {
    storage.setItem('kizuna:pomodoro:h1', '{nope')
    expect(loadPomodoro('h1', storage, NOW)).toBeNull()
    expect(storage.getItem('kizuna:pomodoro:h1')).toBeNull()
  })

  it('a resting state untouched for 25 h comes back as idle with the same config', () => {
    const ready: PomodoroState = {
      ...base(),
      phase: 'ready',
      cycle: 2,
      phaseStartedAt: NOW - 26 * HOUR,
      lastTickAt: NOW - 25 * HOUR,
      rev: 7,
    }
    savePomodoro(ready, storage)
    expect(loadPomodoro('h1', storage, NOW)).toMatchObject({ phase: 'idle', cycle: 0, config })
  })

  it('keeps unsent blocks when a stale state resets', () => {
    const done: PomodoroState = {
      ...base(),
      phase: 'done',
      lastTickAt: NOW - 30 * HOUR,
      pending: [{ blockId: 'b9', minutes: 25, endedAt: NOW - 30 * HOUR }],
    }
    savePomodoro(done, storage)
    expect(loadPomodoro('h1', storage, NOW)?.pending).toHaveLength(1)
  })

  it('a ready state from 2 h ago is kept', () => {
    const ready: PomodoroState = {
      ...base(),
      phase: 'ready',
      cycle: 1,
      phaseStartedAt: NOW - 2 * HOUR,
      lastTickAt: NOW - 2 * HOUR,
    }
    savePomodoro(ready, storage)
    expect(loadPomodoro('h1', storage, NOW)?.phase).toBe('ready')
  })
})

describe('activePomodoros / pendingPomodoros', () => {
  it('lists focus, break and ready, not idle or done', () => {
    const f = focus('h1')
    const b: PomodoroState = { ...focus('h2'), phase: 'break', blockId: null }
    const r: PomodoroState = { ...base('h3'), phase: 'ready', cycle: 1, phaseStartedAt: NOW, lastTickAt: NOW }
    const done: PomodoroState = { ...base('h5'), phase: 'done', lastTickAt: NOW }
    for (const s of [f, b, r, base('h4'), done]) savePomodoro(s, storage)
    storage.setItem('kizuna:pomodoro:config:h1', JSON.stringify({ topic: 'x' }))
    storage.setItem('other', 'x')
    expect(
      activePomodoros(storage, NOW)
        .map((s) => s.habitId)
        .sort(),
    ).toEqual(['h1', 'h2', 'h3'])
  })

  it('pendingPomodoros finds unsent blocks in any phase', () => {
    const done: PomodoroState = {
      ...base('h5'),
      phase: 'done',
      lastTickAt: NOW,
      pending: [{ blockId: 'b', minutes: 5, endedAt: NOW }],
    }
    savePomodoro(done, storage)
    savePomodoro(base('h6'), storage)
    expect(pendingPomodoros(storage, NOW).map((s) => s.habitId)).toEqual(['h5'])
  })
})

describe('cross-tab adoption', () => {
  const at = (rev: number): PomodoroState => ({ ...focus(), rev })

  it('adoptRemote ignores an equal or lower rev and adopts a higher one', () => {
    const raw = (rev: number) => JSON.stringify(at(rev))
    expect(adoptRemote(4, raw(3))).toBeNull()
    expect(adoptRemote(4, raw(4))).toBeNull()
    expect(adoptRemote(4, raw(5))?.rev).toBe(5)
    expect(adoptRemote(4, '{broken')).toBeNull()
  })

  it('subscribePomodoro listens to storage events of its habit only', () => {
    const listeners: ((e: unknown) => void)[] = []
    vi.stubGlobal('window', {
      localStorage: storage,
      addEventListener: (_: string, fn: (e: unknown) => void) => listeners.push(fn),
      removeEventListener: (_: string, fn: (e: unknown) => void) => listeners.splice(listeners.indexOf(fn), 1),
    })
    savePomodoro(at(4), storage)
    const seen: (PomodoroState | null)[] = []
    const off = subscribePomodoro('h1', (s) => seen.push(s))
    const fire = (key: string, s: PomodoroState | null) =>
      listeners.forEach((fn) => fn({ key, newValue: s ? JSON.stringify(s) : null }))
    fire('kizuna:pomodoro:h1', at(3))
    fire('kizuna:pomodoro:h2', at(9))
    expect(seen).toEqual([])
    fire('kizuna:pomodoro:h1', at(5))
    expect(seen).toHaveLength(1)
    expect(seen[0]?.rev).toBe(5)
    fire('kizuna:pomodoro:h1', at(5))
    expect(seen).toHaveLength(1)
    off()
    expect(listeners).toHaveLength(0)
  })
})

describe('sessionAfter', () => {
  const zero = { blocks: 0, minutes: 0, last: 0 }
  it('adds the minutes of blocks that just became pending', () => {
    const prev = focus()
    const next = pomodoroReducer(prev, { type: 'tick', at: NOW + 25 * 60_000 })
    expect(sessionAfter(prev, next, zero)).toEqual({ blocks: 1, minutes: 25, last: 25 })
  })
  it('does not count a block twice', () => {
    const prev = focus()
    const mid = pomodoroReducer(prev, { type: 'tick', at: NOW + 25 * 60_000 })
    const confirmed = pomodoroReducer(mid, { type: 'confirm', blockId: 'b1' })
    expect(sessionAfter(mid, confirmed, { blocks: 1, minutes: 25, last: 25 })).toEqual({ blocks: 1, minutes: 25, last: 25 })
  })
  it('starting a new session from idle or done resets the tally', () => {
    const done: PomodoroState = { ...base(), phase: 'done' }
    const next = pomodoroReducer(done, { type: 'start', at: NOW, blockId: 'b2' })
    expect(sessionAfter(done, next, { blocks: 2, minutes: 50, last: 25 })).toEqual(zero)
  })
})
