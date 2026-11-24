import { afterEach, describe, expect, it, vi } from 'vitest'
import { celebrationAutoCloseMs, celebrationKey, claimCelebration } from '@/lib/celebrate-once'
import { startWhenReady } from '@/lib/motion/cat-animation'

function memory() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('celebrate once per session', () => {
  it('keys by kind, habit or day, and local date', () => {
    expect(celebrationKey('meals', 'h1', '2026-11-22')).toBe('kizuna:celebrated:meals:h1:2026-11-22')
    expect(celebrationKey('day', 'day', '2026-11-22')).not.toBe(celebrationKey('day', 'day', '2026-11-23'))
  })
  it('the first claim wins; undo then redo does not celebrate again', () => {
    const s = memory()
    const k = celebrationKey('day', 'day', '2026-11-22')
    expect(claimCelebration(s, k)).toBe(true)
    expect(claimCelebration(s, k)).toBe(false)
    expect(claimCelebration(s, celebrationKey('meals', 'h1', '2026-11-22'))).toBe(true)
  })
  it('still celebrates when storage is missing or throws', () => {
    expect(claimCelebration(null, 'k')).toBe(true)
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(claimCelebration(broken, 'k')).toBe(true)
  })
  it('auto-closes after one full pass of the cat plus 500 ms', () => {
    expect(celebrationAutoCloseMs('lift')).toBe(6500)
    expect(celebrationAutoCloseMs('jump')).toBe(6340)
    expect(celebrationAutoCloseMs('eat')).toBe(6340)
  })
})

describe('startWhenReady', () => {
  afterEach(() => vi.useRealTimers())
  it('starts when the asset loads, once', () => {
    vi.useFakeTimers()
    let loaded: () => void = () => {}
    const start = vi.fn()
    startWhenReady((done) => {
      loaded = done
    }, 1500, start)
    vi.advanceTimersByTime(500)
    expect(start).not.toHaveBeenCalled()
    loaded()
    loaded()
    expect(start).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(start).toHaveBeenCalledTimes(1)
  })
  it('falls back after the timeout when the asset never loads', () => {
    vi.useFakeTimers()
    const start = vi.fn()
    startWhenReady(() => {}, 1500, start)
    vi.advanceTimersByTime(1499)
    expect(start).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(start).toHaveBeenCalledTimes(1)
  })
  it('cancel stops both paths', () => {
    vi.useFakeTimers()
    let loaded: () => void = () => {}
    const start = vi.fn()
    const cancel = startWhenReady((done) => {
      loaded = done
    }, 1500, start)
    cancel()
    loaded()
    vi.advanceTimersByTime(3000)
    expect(start).not.toHaveBeenCalled()
  })
})

describe('water claim', () => {
  it('is claimed once per habit per day', () => {
    const s = memory()
    expect(claimCelebration(s, celebrationKey('water', 'w1', '2026-11-22'))).toBe(true)
    expect(claimCelebration(s, celebrationKey('water', 'w1', '2026-11-22'))).toBe(false)
    expect(claimCelebration(s, celebrationKey('water', 'w1', '2026-11-23'))).toBe(true)
    expect(claimCelebration(s, celebrationKey('water', 'w2', '2026-11-22'))).toBe(true)
  })
})
