import { describe, expect, it } from 'vitest'
import {
  POMODORO_PRESETS,
  initialPomodoro,
  parsePomodoroState,
  pomodoroReducer,
  pomodoroView,
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
