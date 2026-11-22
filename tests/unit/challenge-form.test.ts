import { describe, expect, it } from 'vitest'
import { parseNewChallengeParams, validateChallengeInput } from '@/lib/challenge-form'

const base = {
  rivalId: 'r',
  habitId: 'h',
  frequency: { type: 'weekly', target: 4 } as const,
  weeks: 4,
  fineAmount: 4500,
}

describe('validateChallengeInput', () => {
  it('accepts a valid challenge', () => {
    expect(validateChallengeInput(base)).toEqual({ ok: true })
  })

  it('rejects invalid fines', () => {
    for (const fineAmount of [0, -1, 1.5, 10_000_001]) {
      expect(validateChallengeInput({ ...base, fineAmount }).ok).toBe(false)
    }
  })

  it('rejects weeks outside 1..52', () => {
    for (const weeks of [0, 53, 1.5]) expect(validateChallengeInput({ ...base, weeks }).ok).toBe(false)
  })

  it('requires rival and habit', () => {
    expect(validateChallengeInput({ ...base, rivalId: '' }).ok).toBe(false)
    expect(validateChallengeInput({ ...base, habitId: '' }).ok).toBe(false)
  })

  it('rejects a weekly target outside 1..7', () => {
    for (const target of [0, 8]) {
      expect(validateChallengeInput({ ...base, frequency: { type: 'weekly', target } }).ok).toBe(false)
    }
    expect(validateChallengeInput({ ...base, frequency: { type: 'daily' } })).toEqual({ ok: true })
  })
})

describe('parseNewChallengeParams', () => {
  it('locks the habit when it comes in the URL', () => {
    expect(parseNewChallengeParams(new URLSearchParams('habito=abc'))).toEqual({
      habitId: 'abc',
      habitLocked: true,
    })
  })

  it('is open without a habit', () => {
    expect(parseNewChallengeParams(new URLSearchParams(''))).toEqual({ habitId: null, habitLocked: false })
  })
})
