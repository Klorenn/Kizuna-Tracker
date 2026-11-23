import { describe, expect, it } from 'vitest'
import {
  POMODORO_PRESETS,
  initialPomodoro,
  parsePomodoroState,
  pomodoroReducer,
  pomodoroView,
  formatReadout,
  sessionSummary,
  STOPWATCH_BLOCK_MIN,
  STOPWATCH_CAP_MIN,
  TIMER_CHIPS,
  validatePomodoroConfig,
} from '@/domain/pomodoro'

const T = 1_800_000_000_000
const M = 60_000
const cfg = { focusMin: 25, breakMin: 5, cycles: 2 }
const open = pomodoroReducer(initialPomodoro('h1', { focusMin: 25, breakMin: 5, cycles: null }), {
  type: 'start',
  at: T,
  blockId: 'b1',
})

describe('pomodoro state machine', () => {
  it('runs focus, break, ready and the last round without a break', () => {
    let s = pomodoroReducer(initialPomodoro('h1', cfg), { type: 'start', at: T, blockId: 'b1' })
    expect([s.phase, s.cycle, s.blockId, s.phaseStartedAt]).toEqual(['focus', 1, 'b1', T])
    expect(pomodoroView(s, T + 10 * M + 30_000)).toEqual({
      phase: 'focus',
      remainingMs: 14.5 * M,
      displayMs: 14.5 * M,
      direction: 'down',
      elapsedMs: 10.5 * M,
      cycle: 1,
      cyclesTotal: 2,
      paused: false,
    })
    s = pomodoroReducer(s, { type: 'pause', at: T + 10 * M })
    expect(pomodoroView(s, T + 40 * M).remainingMs).toBe(15 * M)
    s = pomodoroReducer(s, { type: 'resume', at: T + 40 * M })
    expect(s.pausedMs).toBe(30 * M)
    s = pomodoroReducer(s, { type: 'tick', at: T + 55 * M })
    expect([s.phase, s.pending, s.phaseStartedAt]).toEqual([
      'break',
      [{ blockId: 'b1', minutes: 25, endedAt: T + 55 * M }],
      T + 55 * M,
    ])
    s = pomodoroReducer(s, { type: 'tick', at: T + 60 * M })
    expect(s.phase).toBe('ready')
    s = pomodoroReducer(s, { type: 'confirm', blockId: 'b1' })
    expect([s.pending, s.credited]).toEqual([[], 1])
    s = pomodoroReducer(s, { type: 'start', at: T + 62 * M, blockId: 'b2' })
    expect([s.phase, s.cycle]).toEqual(['focus', 2])
    s = pomodoroReducer(s, { type: 'tick', at: T + 87 * M })
    expect([s.phase, s.pending]).toEqual(['done', [{ blockId: 'b2', minutes: 25, endedAt: T + 87 * M }]])
  })

  it('finishes early, crediting whole minutes only', () => {
    const f = pomodoroReducer(initialPomodoro('h1', cfg), { type: 'start', at: T, blockId: 'b3' })
    expect(pomodoroReducer(f, { type: 'finish', at: T + 7 * M + 59_000 }).pending).toEqual([
      { blockId: 'b3', minutes: 7, endedAt: T + 7 * M + 59_000 },
    ])
    expect(pomodoroReducer(f, { type: 'finish', at: T + 30_000 })).toMatchObject({ phase: 'done', pending: [] })
  })

  it('skips focus into the break and the break into the next round', () => {
    const f = pomodoroReducer(initialPomodoro('h1', cfg), { type: 'start', at: T, blockId: 'b3' })
    const k = pomodoroReducer(f, { type: 'skip', at: T + 12 * M + 10_000, blockId: 'unused' })
    expect([k.phase, k.pending]).toEqual(['break', [{ blockId: 'b3', minutes: 12, endedAt: T + 12 * M + 10_000 }]])
    expect(pomodoroReducer(k, { type: 'skip', at: T + 13 * M, blockId: 'b4' })).toMatchObject({
      phase: 'focus',
      cycle: 2,
      blockId: 'b4',
    })
  })

  it('catches up after hours away with a single block and never starts another focus alone', () => {
    expect(pomodoroReducer(open, { type: 'tick', at: T + 180 * M })).toMatchObject({
      phase: 'ready',
      pending: [{ blockId: 'b1', minutes: 25, endedAt: T + 25 * M }],
    })
  })

  it('never lets elapsed time go backwards when the clock does', () => {
    const c1 = pomodoroReducer(open, { type: 'tick', at: T + 10 * M })
    const c2 = pomodoroReducer(c1, { type: 'tick', at: T + 5 * M })
    expect(c2.phaseStartedAt).toBe(T - 5 * M)
    expect(pomodoroView(c2, T + 5 * M).elapsedMs).toBe(10 * M)
  })

  it('does not count a long pause', () => {
    const p = pomodoroReducer(open, { type: 'pause', at: T + 5 * M })
    expect(pomodoroReducer(p, { type: 'tick', at: T + 600 * M })).toMatchObject({ phase: 'focus', pending: [] })
  })

  it('returns the same object for events that do not apply and bumps rev otherwise', () => {
    expect(pomodoroReducer(open, { type: 'resume', at: T })).toBe(open)
    const idle = initialPomodoro('h1', cfg)
    expect(pomodoroReducer(idle, { type: 'tick', at: T })).toBe(idle)
    expect(pomodoroReducer(idle, { type: 'confirm', blockId: 'nope' })).toBe(idle)
    expect(pomodoroReducer(open, { type: 'pause', at: T + M }).rev).toBe(open.rev + 1)
  })

  it('drops a pending block without crediting it', () => {
    const s = pomodoroReducer(open, { type: 'finish', at: T + 10 * M })
    const d = pomodoroReducer(s, { type: 'drop', blockId: 'b1' })
    expect([d.pending, d.credited]).toEqual([[], 0])
  })
})

describe('pomodoro fix round 1', () => {
  it('does not end a paused-and-resumed break early', () => {
    let s = pomodoroReducer(initialPomodoro('h1', cfg), { type: 'start', at: T, blockId: 'b1' })
    s = pomodoroReducer(s, { type: 'tick', at: T + 25 * M })
    expect(s.phase).toBe('break')
    s = pomodoroReducer(s, { type: 'pause', at: T + 27 * M })
    s = pomodoroReducer(s, { type: 'resume', at: T + 30 * M })
    s = pomodoroReducer(s, { type: 'tick', at: T + 31 * M })
    expect(s.phase).toBe('break')
    expect(pomodoroView(s, T + 31 * M).elapsedMs).toBe(3 * M)
    s = pomodoroReducer(s, { type: 'tick', at: T + 33 * M })
    expect(s.phase).toBe('ready')
  })

  it('returns the very same state for a tick that changes nothing', () => {
    expect(pomodoroReducer(open, { type: 'tick', at: T + 1000 })).toBe(open)
    const later = pomodoroReducer(open, { type: 'tick', at: T + 2000 })
    expect(later).toBe(open)
  })

  it('rejects corrupted stored states', () => {
    const bad = (patch: Record<string, unknown>) => parsePomodoroState(JSON.stringify({ ...open, ...patch }))
    expect(bad({})).not.toBeNull()
    expect(bad({ pausedMs: -1 })).toBeNull()
    expect(bad({ cycle: -1 })).toBeNull()
    expect(bad({ cycle: 1.5 })).toBeNull()
    expect(bad({ credited: -2 })).toBeNull()
    expect(bad({ rev: -1 })).toBeNull()
    expect(bad({ phaseStartedAt: -5 })).toBeNull()
    expect(bad({ pausedAt: T - 1000 })).toBeNull()
    expect(bad({ phase: 'idle', pausedAt: T + 1000 })).toBeNull()
    expect(bad({ pending: [{ blockId: 'x', minutes: 0, endedAt: T }] })).toBeNull()
    expect(bad({ pending: [{ blockId: 'x', minutes: 91, endedAt: T }] })).toBeNull()
    expect(bad({ pending: [{ blockId: 'x', minutes: 25, endedAt: -1 }] })).toBeNull()
  })
})

describe('pomodoro config and persistence', () => {
  it('validates the configuration', () => {
    expect(validatePomodoroConfig({ focusMin: 4, breakMin: 5, cycles: null })).toEqual({
      ok: false,
      error: 'El foco va de 5 a 90 minutos.',
    })
    expect(validatePomodoroConfig({ focusMin: 25, breakMin: 31, cycles: null })).toEqual({
      ok: false,
      error: 'El descanso va de 1 a 30 minutos.',
    })
    expect(validatePomodoroConfig({ focusMin: 25, breakMin: 5, cycles: 0 })).toEqual({
      ok: false,
      error: 'Las rondas van de 1 a 12.',
    })
    expect(validatePomodoroConfig({ focusMin: 50, breakMin: 10, cycles: 12 })).toEqual({ ok: true })
    expect(POMODORO_PRESETS.map((p) => p.key)).toEqual(['25-5', '50-10'])
  })
  it('round-trips a stored state and rejects garbage', () => {
    expect(parsePomodoroState(JSON.stringify(open))).toEqual(open)
    for (const bad of [null, '', '{', '{"v":2}', JSON.stringify({ ...open, phase: 'nap' })]) {
      expect(parsePomodoroState(bad)).toBeNull()
    }
  })
})

// ---------------------------------------------------------------- Task 30: timer and stopwatch

const timerAt = (min: number, at = T, id = 'tb') =>
  pomodoroReducer(initialPomodoro('h1', { focusMin: min, breakMin: 5, cycles: 4 }, 'timer'), {
    type: 'start',
    at,
    blockId: id,
  })
const ids: [string, string, string] = ['a', 'b', 'c']
const watchAt = (at = T) =>
  pomodoroReducer(initialPomodoro('h1', cfg, 'stopwatch'), { type: 'start', at, blockIds: ids })

describe('timer mode', () => {
  it('counts down to zero by itself with one block and no break', () => {
    const s = pomodoroReducer(timerAt(25), { type: 'tick', at: T + 25 * M })
    expect(s.phase).toBe('done')
    expect(s.pending).toEqual([{ blockId: 'tb', minutes: 25, endedAt: T + 25 * M }])
    expect(pomodoroReducer(s, { type: 'tick', at: T + 99 * M }).phase).toBe('done')
    const mid = pomodoroReducer(timerAt(25), { type: 'tick', at: T + 24 * M })
    expect(mid.phase).toBe('focus')
    expect(pomodoroView(mid, T + 24 * M)).toMatchObject({ direction: 'down', displayMs: M, paused: false })
  })

  it('does not count pause time', () => {
    let s = timerAt(25)
    s = pomodoroReducer(s, { type: 'pause', at: T + 10 * M })
    s = pomodoroReducer(s, { type: 'resume', at: T + 17 * M })
    expect(pomodoroReducer(s, { type: 'tick', at: T + 31 * M }).phase).toBe('focus')
    s = pomodoroReducer(s, { type: 'tick', at: T + 32 * M })
    expect(s.phase).toBe('done')
    expect(s.pending).toEqual([{ blockId: 'tb', minutes: 25, endedAt: T + 32 * M }])
  })

  it('finishing early queues the whole minutes; under a minute signals tooShort', () => {
    const early = pomodoroReducer(timerAt(25), { type: 'finish', at: T + 10 * M + 40_000 })
    expect(early.phase).toBe('done')
    expect(early.pending).toEqual([{ blockId: 'tb', minutes: 10, endedAt: T + 10 * M + 40_000 }])
    const short = pomodoroReducer(timerAt(25), { type: 'finish', at: T + 50_000 })
    expect(short.pending).toEqual([])
    expect(short.tooShort).toBe(true)
    expect(short.phase).toBe('idle')
  })

  it('validates the minutes as 1..90 whole numbers', () => {
    const v = (m: number) => validatePomodoroConfig({ focusMin: m, breakMin: 5, cycles: 4 }, 'timer')
    for (const bad of [0, 91, 12.5]) expect(v(bad)).toEqual({ ok: false, error: 'Elige entre 1 y 90 minutos.' })
    expect(v(1)).toEqual({ ok: true })
    expect(v(90)).toEqual({ ok: true })
    expect(validatePomodoroConfig({ focusMin: 3, breakMin: 5, cycles: 4 }).ok).toBe(false)
  })

  it('ignores skip and exports its chips', () => {
    const s = timerAt(25)
    expect(pomodoroReducer(s, { type: 'skip', at: T + 5 * M, blockId: 'x' })).toBe(s)
    expect(TIMER_CHIPS).toEqual([15, 25, 45, 60])
  })
})

describe('stopwatch mode', () => {
  it('finishing queues the whole elapsed minutes with the first id', () => {
    const s = pomodoroReducer(watchAt(), { type: 'finish', at: T + 37 * M + 59_000 })
    expect(s.phase).toBe('done')
    expect(s.pending).toEqual([{ blockId: 'a', minutes: 37, endedAt: T + 37 * M + 59_000 }])
    expect(pomodoroView(watchAt(), T + 61 * M + 9_000)).toMatchObject({ direction: 'up', displayMs: 61 * M + 9_000 })
  })

  it('closes a 90-minute block by itself and keeps counting', () => {
    let s = pomodoroReducer(watchAt(), { type: 'tick', at: T + 90 * M })
    expect(s.phase).toBe('focus')
    expect(s.pending).toEqual([{ blockId: 'a', minutes: 90, endedAt: T + 90 * M }])
    expect(pomodoroView(s, T + 95 * M).displayMs).toBe(95 * M)
    s = pomodoroReducer(s, { type: 'finish', at: T + 100 * M })
    expect(s.pending).toEqual([
      { blockId: 'a', minutes: 90, endedAt: T + 90 * M },
      { blockId: 'b', minutes: 10, endedAt: T + 100 * M },
    ])
  })

  it('stops at the 4-hour cap with 90 + 90 + 60', () => {
    const s = pomodoroReducer(watchAt(), { type: 'tick', at: T + 241 * M })
    expect(s.pending).toEqual([
      { blockId: 'a', minutes: 90, endedAt: T + 90 * M },
      { blockId: 'b', minutes: 90, endedAt: T + 180 * M },
      { blockId: 'c', minutes: 60, endedAt: T + 240 * M },
    ])
    expect(s.phase).toBe('done')
    expect(s.endReason).toBe('cap')
    expect(STOPWATCH_BLOCK_MIN).toBe(90)
    expect(STOPWATCH_CAP_MIN).toBe(240)
  })

  it('has no day-change cut', () => {
    const start = new Date(2026, 10, 22, 23, 30).getTime()
    let s = watchAt(start)
    s = pomodoroReducer(s, { type: 'tick', at: start + 40 * M })
    expect(s.phase).toBe('focus')
    expect(s.pending).toEqual([])
    s = pomodoroReducer(s, { type: 'finish', at: start + 40 * M })
    expect(s.pending).toEqual([{ blockId: 'a', minutes: 40, endedAt: start + 40 * M }])
  })

  it('does not count pause time toward the minutes, the 90 or the cap', () => {
    let s = pomodoroReducer(watchAt(), { type: 'pause', at: T + 30 * M })
    s = pomodoroReducer(s, { type: 'resume', at: T + 50 * M })
    s = pomodoroReducer(s, { type: 'tick', at: T + 109 * M })
    expect(s.pending).toEqual([])
    s = pomodoroReducer(s, { type: 'tick', at: T + 110 * M })
    expect(s.pending).toEqual([{ blockId: 'a', minutes: 90, endedAt: T + 110 * M }])
    const fin = pomodoroReducer(watchAt(), { type: 'pause', at: T + 30 * M })
    expect(pomodoroReducer(fin, { type: 'tick', at: T + 600 * M }).phase).toBe('focus')
  })

  it('settles a chunk that passed while the page was away before a pause', () => {
    const s = pomodoroReducer(watchAt(), { type: 'pause', at: T + 100 * M })
    expect(s.pending).toEqual([{ blockId: 'a', minutes: 90, endedAt: T + 90 * M }])
    const fin = pomodoroReducer(s, { type: 'finish', at: T + 120 * M })
    expect(fin.pending[1]).toEqual({ blockId: 'b', minutes: 10, endedAt: T + 120 * M })
  })

  it('under a minute never queues and returns to idle', () => {
    const s = pomodoroReducer(watchAt(), { type: 'finish', at: T + 59_000 })
    expect([s.phase, s.pending, s.tooShort]).toEqual(['idle', [], true])
  })
})

describe('fix round 1: session blocks by id, pause vs cap, legacy behaviour', () => {
  it('a stopwatch paused for 20 minutes reaches the cap at T+260 and its first chunk at T+110', () => {
    let s = pomodoroReducer(watchAt(), { type: 'pause', at: T + 30 * M })
    s = pomodoroReducer(s, { type: 'resume', at: T + 50 * M })
    const early = pomodoroReducer(s, { type: 'tick', at: T + 259 * M })
    expect(early.phase).toBe('focus')
    expect(early.pending).toEqual([
      { blockId: 'a', minutes: 90, endedAt: T + 110 * M },
      { blockId: 'b', minutes: 90, endedAt: T + 200 * M },
    ])
    const capped = pomodoroReducer(s, { type: 'tick', at: T + 261 * M })
    expect(capped.phase).toBe('done')
    expect(capped.pending).toEqual([
      { blockId: 'a', minutes: 90, endedAt: T + 110 * M },
      { blockId: 'b', minutes: 90, endedAt: T + 200 * M },
      { blockId: 'c', minutes: 60, endedAt: T + 260 * M },
    ])
    expect(capped.pending.reduce((n, p) => n + p.minutes, 0)).toBe(240)
  })

  it('a stored state without mode behaves exactly like a pomodoro made before the change', () => {
    const added = ['mode', 'blockIds', 'chunks', 'endReason', 'tooShort', 'sessionBlocks']
    const legacy = parsePomodoroState(
      JSON.stringify(Object.fromEntries(Object.entries(open).filter(([k]) => !added.includes(k)))),
    )!
    const ticked = pomodoroReducer(legacy, { type: 'tick', at: T + 25 * M })
    expect([ticked.phase, ticked.pending]).toEqual(['break', [{ blockId: 'b1', minutes: 25, endedAt: T + 25 * M }]])
    const fin = pomodoroReducer(legacy, { type: 'finish', at: T + 7 * M + 59_000 })
    expect([fin.phase, fin.pending]).toEqual(['done', [{ blockId: 'b1', minutes: 7, endedAt: T + 7 * M + 59_000 }]])
    expect(pomodoroReducer(legacy, { type: 'skip', at: T + 12 * M, blockId: 'x' }).phase).toBe('break')
  })

  it('sessionSummary is decided by this session\'s block ids', () => {
    // a pending block of an earlier session confirms while the new session's block is dropped
    const old = { ...initialPomodoro('h1', cfg, 'timer'), pending: [{ blockId: 'old', minutes: 30, endedAt: T - M }] }
    let s = pomodoroReducer(old, { type: 'start', at: T, blockId: 'n1' })
    s = pomodoroReducer(s, { type: 'finish', at: T + 10 * M })
    expect(sessionSummary(s)).toEqual({ status: 'pending', pendingMin: 10, confirmedMin: 0 })
    s = pomodoroReducer(s, { type: 'confirm', blockId: 'old' })
    expect(sessionSummary(s).status).toBe('pending')
    s = pomodoroReducer(s, { type: 'drop', blockId: 'n1' })
    expect(sessionSummary(s)).toEqual({ status: 'none', pendingMin: 0, confirmedMin: 0 })
  })

  it('two stopwatch blocks: one confirmed and one pending is not "confirmed" yet', () => {
    let s = pomodoroReducer(watchAt(), { type: 'tick', at: T + 90 * M })
    s = pomodoroReducer(s, { type: 'finish', at: T + 100 * M })
    s = pomodoroReducer(s, { type: 'confirm', blockId: 'a' })
    expect(sessionSummary(s)).toEqual({ status: 'pending', pendingMin: 10, confirmedMin: 90 })
    s = pomodoroReducer(s, { type: 'confirm', blockId: 'b' })
    expect(sessionSummary(s)).toEqual({ status: 'confirmed', pendingMin: 0, confirmedMin: 100 })
  })

  it('a session with a confirmed and a dropped block never reads as confirmed', () => {
    let s = pomodoroReducer(watchAt(), { type: 'tick', at: T + 90 * M })
    s = pomodoroReducer(s, { type: 'finish', at: T + 100 * M })
    s = pomodoroReducer(s, { type: 'confirm', blockId: 'a' })
    s = pomodoroReducer(s, { type: 'drop', blockId: 'b' })
    expect(sessionSummary(s).status).toBe('partial')
  })

  it('a new session starts the tally from zero and the tally survives a parse', () => {
    let s = pomodoroReducer(watchAt(), { type: 'finish', at: T + 5 * M })
    expect(s.sessionBlocks).toHaveLength(1)
    expect(parsePomodoroState(JSON.stringify(s))).toEqual(s)
    s = pomodoroReducer(s, { type: 'start', at: T + 10 * M, blockIds: ids })
    expect(s.sessionBlocks).toEqual([])
  })
})

describe('readout', () => {
  it('counts down rounding up and counts up rounding down, with hours past 59:59', () => {
    expect(formatReadout(25 * M, 'down')).toBe('25:00')
    expect(formatReadout(24 * M + 59_100, 'down')).toBe('25:00')
    expect(formatReadout(0, 'up')).toBe('00:00')
    expect(formatReadout(999, 'up')).toBe('00:00')
    expect(formatReadout(59 * M + 59_999, 'up')).toBe('59:59')
    expect(formatReadout(3600_000, 'up')).toBe('1:00:00')
    expect(formatReadout(3909_000, 'up')).toBe('1:05:09')
    expect(formatReadout(Number.NaN, 'up')).toBe('00:00')
  })
})

describe('mode persistence and ticks', () => {
  it('parses a state without mode as pomodoro and keeps the mode of new ones', () => {
    const added = ['mode', 'blockIds', 'chunks', 'endReason', 'tooShort']
    const legacy = Object.fromEntries(Object.entries(open).filter(([k]) => !added.includes(k)))
    const parsed = parsePomodoroState(JSON.stringify(legacy))
    expect(parsed?.mode).toBe('pomodoro')
    expect(parsed?.phase).toBe('focus')
    expect(parsePomodoroState(JSON.stringify(watchAt()))).toEqual(watchAt())
    expect(parsePomodoroState(JSON.stringify(timerAt(25)))).toEqual(timerAt(25))
  })

  it('rejects a running stopwatch with fewer than three ids and a bad mode', () => {
    const w = watchAt()
    expect(parsePomodoroState(JSON.stringify({ ...w, blockIds: ['a', 'b'] }))).toBeNull()
    expect(parsePomodoroState(JSON.stringify({ ...w, mode: 'nap' }))).toBeNull()
    const idle = initialPomodoro('h1', cfg, 'stopwatch')
    expect(parsePomodoroState(JSON.stringify({ ...idle, pending: [{ blockId: 'x', minutes: 5, endedAt: T }] }))).not.toBeNull()
  })

  it('returns the same object for ticks a second apart in every mode', () => {
    for (const s of [open, timerAt(25), watchAt()]) {
      expect(pomodoroReducer(s, { type: 'tick', at: T + 1000 })).toBe(s)
      expect(pomodoroReducer(s, { type: 'tick', at: T + 2000 })).toBe(s)
    }
  })

  it('reset keeps the mode and the unsent blocks', () => {
    const done = pomodoroReducer(watchAt(), { type: 'finish', at: T + 5 * M })
    const r = pomodoroReducer(done, { type: 'reset' })
    expect([r.mode, r.phase, r.pending.length]).toEqual(['stopwatch', 'idle', 1])
  })
})
