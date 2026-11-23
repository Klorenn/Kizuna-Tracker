import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialPomodoro, pomodoroReducer, type PomodoroState } from '@/domain/pomodoro'
import {
  activePomodoros,
  adoptRemote,
  clearPomodoroStorage,
  DEFAULT_POMODORO_PREFS,
  discardPending,
  EMPTY_SESSION,
  isFreshEnd,
  loadPomodoro,
  loadPrefs,
  savePrefs,
  openPomodoroStorage,
  pendingPomodoros,
  pomodoroBoxReducer,
  reconcileSession,
  savePomodoro,
  savePomodoroIfNewer,
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
  const zero = EMPTY_SESSION
  const block = (status: 'pending' | 'confirmed' | 'dropped') => ({ blocks: 1, minutes: 25, last: 25, lastId: 'b1', lastStatus: status })

  it('adds the minutes of blocks that just became pending', () => {
    const prev = focus()
    const next = pomodoroReducer(prev, { type: 'tick', at: NOW + 25 * 60_000 })
    expect(sessionAfter(prev, next, zero)).toEqual(block('pending'))
  })
  it('does not count a block twice', () => {
    const prev = focus()
    const mid = pomodoroReducer(prev, { type: 'tick', at: NOW + 25 * 60_000 })
    const confirmed = pomodoroReducer(mid, { type: 'confirm', blockId: 'b1' })
    expect(sessionAfter(mid, confirmed, block('pending'))).toMatchObject({ blocks: 1, minutes: 25 })
  })
  it('"Sumamos" waits for the server: confirm marks the last block confirmed, drop marks it dropped', () => {
    const prev = focus()
    const mid = pomodoroReducer(prev, { type: 'tick', at: NOW + 25 * 60_000 })
    expect(sessionAfter(mid, pomodoroReducer(mid, { type: 'confirm', blockId: 'b1' }), block('pending')).lastStatus).toBe('confirmed')
    expect(sessionAfter(mid, pomodoroReducer(mid, { type: 'drop', blockId: 'b1' }), block('pending')).lastStatus).toBe('dropped')
  })
  it('reconcileSession settles a block the banner confirmed or dropped while the screen was closed', () => {
    const pending = block('pending')
    const gone: PomodoroState = { ...base(), phase: 'done', pending: [], credited: 1 }
    expect(reconcileSession(gone, pending).lastStatus).toBe('confirmed')
    expect(reconcileSession({ ...gone, credited: 0 }, pending).lastStatus).toBe('dropped')
    const still: PomodoroState = { ...gone, pending: [{ blockId: 'b1', minutes: 25, endedAt: NOW }] }
    expect(reconcileSession(still, pending)).toBe(pending)
  })
  it('starting a new session from idle or done resets the tally', () => {
    const done: PomodoroState = { ...base(), phase: 'done' }
    const next = pomodoroReducer(done, { type: 'start', at: NOW, blockId: 'b2' })
    expect(sessionAfter(done, next, block('confirmed'))).toEqual(zero)
  })
})

describe('user namespace and guarded storage', () => {
  it('one account never reads another account\'s timer or pending blocks', () => {
    const base = new MemoryStorage()
    const a = openPomodoroStorage('user-a', () => base)
    const b = openPomodoroStorage('user-b', () => base)
    const withPending: PomodoroState = { ...focus('h1'), phase: 'done', pending: [{ blockId: 'x', minutes: 5, endedAt: NOW }] }
    savePomodoro(withPending, a)
    expect(loadPomodoro('h1', a, NOW)).not.toBeNull()
    expect(loadPomodoro('h1', b, NOW)).toBeNull()
    expect(pendingPomodoros(b, NOW)).toEqual([])
    expect(activePomodoros(b, NOW)).toEqual([])
    expect(pendingPomodoros(a, NOW)).toHaveLength(1)
  })

  it('clearPomodoroStorage(userId) removes that user only (and the old un-namespaced keys)', () => {
    const base = new MemoryStorage()
    const a = openPomodoroStorage('user-c', () => base)
    const b = openPomodoroStorage('user-d', () => base)
    savePomodoro(focus('h1'), a)
    savePomodoro(focus('h2'), b)
    base.setItem('kizuna:pomodoro:legacy', '{}')
    base.setItem('unrelated', '1')
    clearPomodoroStorage('user-c', () => base)
    expect(loadPomodoro('h1', openPomodoroStorage('user-c', () => base), NOW)).toBeNull()
    expect(loadPomodoro('h2', b, NOW)).not.toBeNull()
    expect(base.getItem('kizuna:pomodoro:legacy')).toBeNull()
    expect(base.getItem('unrelated')).toBe('1')
  })

  it('removes the old un-namespaced keys once, when the storage is first opened', () => {
    const base = new MemoryStorage()
    base.setItem('kizuna:pomodoro:h1', '{}')
    base.setItem('kizuna:pomodoro:config:h1', '{}')
    base.setItem('kizuna:pomodoro:session:h1', '{}')
    base.setItem('kizuna:user:user-x:kizuna:pomodoro:h9', '{"keep":true}')
    base.setItem('unrelated', '1')
    openPomodoroStorage('user-x', () => base)
    expect(base.getItem('kizuna:pomodoro:h1')).toBeNull()
    expect(base.getItem('kizuna:pomodoro:config:h1')).toBeNull()
    expect(base.getItem('kizuna:pomodoro:session:h1')).toBeNull()
    expect(base.getItem('kizuna:user:user-x:kizuna:pomodoro:h9')).toBe('{"keep":true}')
    expect(base.getItem('unrelated')).toBe('1')
    // once: a later open of the same storage does not sweep again
    base.setItem('kizuna:pomodoro:late', '{}')
    openPomodoroStorage('user-x', () => base)
    expect(base.getItem('kizuna:pomodoro:late')).toBe('{}')
  })

  it('the sweep of old keys never throws on a blocked or failing storage', () => {
    const failing = new MemoryStorage()
    failing.removeItem = () => {
      throw new DOMException('denied', 'SecurityError')
    }
    failing.setItem('kizuna:pomodoro:h1', '{}')
    expect(() => openPomodoroStorage('user-y', () => failing)).not.toThrow()
    expect(() =>
      openPomodoroStorage('user-y', () => {
        throw new DOMException('denied', 'SecurityError')
      }),
    ).not.toThrow()
  })

  it('blocked storage (the getter throws): the timer still works in memory and says so', () => {
    const s = openPomodoroStorage('user-e', () => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(s.degraded).toBe(true)
    expect(savePomodoro(focus('h1'), s)).toBe(true)
    expect(loadPomodoro('h1', s, NOW)).toEqual(focus('h1'))
    expect(activePomodoros(s, NOW)).toHaveLength(1)
  })

  it('a full device (setItem throws): the write is kept in memory and degraded is set', () => {
    const base = new MemoryStorage()
    base.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
    const s = openPomodoroStorage('user-f', () => base)
    expect(s.degraded).toBe(false)
    savePomodoro(focus('h1'), s)
    expect(s.degraded).toBe(true)
    expect(loadPomodoro('h1', s, NOW)).toEqual(focus('h1'))
  })

  it('subscribePomodoro listens to the namespaced key', () => {
    const listeners: ((e: unknown) => void)[] = []
    vi.stubGlobal('window', {
      addEventListener: (_: string, fn: (e: unknown) => void) => listeners.push(fn),
      removeEventListener: () => {},
    })
    const base = new MemoryStorage()
    const s = openPomodoroStorage('user-g', () => base)
    const seen: (PomodoroState | null)[] = []
    subscribePomodoro('h1', (x) => seen.push(x), s)
    const raw = JSON.stringify({ ...focus(), rev: 9 })
    listeners.forEach((fn) => fn({ key: 'kizuna:pomodoro:h1', newValue: raw }))
    expect(seen).toEqual([])
    listeners.forEach((fn) => fn({ key: s.physicalKey('kizuna:pomodoro:h1'), newValue: raw }))
    expect(seen).toHaveLength(1)
  })
})

describe('archived or switched habit', () => {
  it('its pending blocks are found and discarded, and nothing else changes', () => {
    const s: PomodoroState = { ...base('gone'), phase: 'done', lastTickAt: NOW, pending: [{ blockId: 'x', minutes: 25, endedAt: NOW }, { blockId: 'y', minutes: 5, endedAt: NOW }] }
    savePomodoro(s, storage)
    expect(pendingPomodoros(storage, NOW).map((p) => p.habitId)).toEqual(['gone'])
    expect(discardPending('gone', storage, NOW)).toBe(2)
    expect(pendingPomodoros(storage, NOW)).toEqual([])
    expect(discardPending('gone', storage, NOW)).toBe(0)
  })
})

describe('two tabs at the same rev (a pause must not be lost)', () => {
  it('a user action lands above any tick refresh made from the same rev', () => {
    const box = { s: { ...focus(), rev: 5 }, session: EMPTY_SESSION }
    const paused = pomodoroBoxReducer(box, { type: 'pause', at: NOW + 20_000 })
    const refreshed = pomodoroBoxReducer(box, { type: 'tick', at: NOW + 20_000 })
    expect(paused.s.pausedAt).toBe(NOW + 20_000)
    expect(refreshed.s.rev).toBe(6)
    expect(paused.s.rev).toBeGreaterThan(refreshed.s.rev)
    // the other tab adopts the pause; the pausing tab ignores the refresh
    expect(adoptRemote(refreshed.s.rev, JSON.stringify(paused.s))?.pausedAt).toBe(NOW + 20_000)
    expect(adoptRemote(paused.s.rev, JSON.stringify(refreshed.s))).toBeNull()
  })

  it('re-reads before writing: a newer stored state is not overwritten', () => {
    const box = { s: { ...focus(), rev: 5 }, session: EMPTY_SESSION }
    const paused = pomodoroBoxReducer(box, { type: 'pause', at: NOW + 20_000 })
    const refreshed = pomodoroBoxReducer(box, { type: 'tick', at: NOW + 20_000 })
    savePomodoro(paused.s, storage)
    const r = savePomodoroIfNewer(refreshed.s, storage)
    expect(r.status).toBe('stale')
    expect(loadPomodoro('h1', storage, NOW + 20_000)?.pausedAt).toBe(NOW + 20_000)
    expect(savePomodoroIfNewer({ ...paused.s, rev: paused.s.rev + 1 }, storage).status).toBe('saved')
  })
})

describe('isFreshEnd (decided from the last live tick)', () => {
  const END = NOW
  it('a throttled background tab (one tick a minute) still counts as alive', () => {
    expect(isFreshEnd(END - 30_000, END, END + 30_000)).toBe(true)
    expect(isFreshEnd(END - 59_000, END, END + 59_000)).toBe(true)
  })
  it('a normal live tick is fresh', () => {
    expect(isFreshEnd(END - 500, END, END + 400)).toBe(true)
  })
  it('after sleep or a closed tab (long gap since the last tick) it is not', () => {
    expect(isFreshEnd(END - 3_600_000, END, END + 7_200_000)).toBe(false)
    expect(isFreshEnd(null, END, END + 1000)).toBe(false)
  })
  it('a tick that already came after the end was not the first to see it', () => {
    expect(isFreshEnd(END + 1000, END, END + 2000)).toBe(false)
  })
})

describe('modes (timer and stopwatch)', () => {
  const idle = (mode: 'pomodoro' | 'timer' | 'stopwatch' = 'pomodoro') => ({
    s: initialPomodoro('h1', config, mode),
    session: EMPTY_SESSION,
  })

  it('remembers the last mode per user and per habit', () => {
    const base = new MemoryStorage()
    const a = openPomodoroStorage('user-a', () => base)
    const b = openPomodoroStorage('user-b', () => base)
    expect(loadPrefs('h1', a).mode).toBe('pomodoro')
    expect(loadPrefs('h1', a).timerMin).toBe(25)
    savePrefs('h1', { ...loadPrefs('h1', a), mode: 'stopwatch', timerMin: 45 }, a)
    expect(loadPrefs('h1', a)).toMatchObject({ mode: 'stopwatch', timerMin: 45 })
    expect(loadPrefs('h2', a).mode).toBe('pomodoro')
    expect(loadPrefs('h1', b).mode).toBe('pomodoro')
  })

  it('ignores a stored mode or timer length that makes no sense', () => {
    storage.setItem('kizuna:pomodoro:config:h1', JSON.stringify({ ...DEFAULT_POMODORO_PREFS, mode: 'nap', timerMin: 500 }))
    expect(loadPrefs('h1', storage)).toMatchObject({ mode: 'pomodoro', timerMin: 25 })
  })

  it('changes the mode only while idle or done, keeping unsent blocks', () => {
    const t = pomodoroBoxReducer(idle(), { type: 'setMode', mode: 'timer', config: { ...config, focusMin: 15 } })
    expect([t.s.mode, t.s.config.focusMin, t.s.phase]).toEqual(['timer', 15, 'idle'])
    const running = pomodoroBoxReducer(t, { type: 'start', at: NOW, blockId: 'b1' })
    expect(running.s.phase).toBe('focus')
    expect(pomodoroBoxReducer(running, { type: 'setMode', mode: 'stopwatch', config })).toBe(running)
    const done = pomodoroBoxReducer(running, { type: 'finish', at: NOW + 3 * 60_000 })
    expect(done.s.phase).toBe('done')
    const sw = pomodoroBoxReducer(done, { type: 'setMode', mode: 'stopwatch', config })
    expect([sw.s.mode, sw.s.phase, sw.s.pending]).toEqual(['stopwatch', 'idle', done.s.pending])
  })

  it('a stopwatch tallies each closed block', () => {
    const ids: [string, string, string] = ['a', 'b', 'c']
    let box = pomodoroBoxReducer(idle('stopwatch'), { type: 'start', at: NOW, blockId: 'x', blockIds: ids })
    expect(box.s.blockIds).toEqual(ids)
    box = pomodoroBoxReducer(box, { type: 'tick', at: NOW + 91 * 60_000 })
    expect(box.s.pending).toEqual([{ blockId: 'a', minutes: 90, endedAt: NOW + 90 * 60_000 }])
    expect(box.session).toMatchObject({ blocks: 1, minutes: 90, lastId: 'a', lastStatus: 'pending' })
    box = pomodoroBoxReducer(box, { type: 'finish', at: NOW + 100 * 60_000 })
    expect(box.session).toMatchObject({ blocks: 2, minutes: 100, lastId: 'b' })
  })
})
