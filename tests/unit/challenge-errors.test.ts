import { describe, expect, it } from 'vitest'
import { CHALLENGE_ERRORS, GENERIC_ERROR, mapChallengeError } from '@/lib/challenge-errors'

const CODES = [
  'not_authenticated', 'challenge_not_found', 'not_rival', 'challenge_not_proposed', 'challenge_not_cancellable',
  'rival_habit_required', 'rival_habit_invalid', 'rival_habit_needs_photo', 'rival_habit_duplicate', 'not_friends',
  'reject_window_closed', 'already_rejected', 'creator_habit_unavailable', 'checkin_out_of_range', 'checkin_not_found',
  'invalid_reason', 'item_not_found', 'not_creator', 'challenge_not_open', 'invalid_target', 'habit_invalid',
  'too_many_items', 'habit_already_in_challenge', 'challenge_ending', 'challenge_not_active', 'not_responder',
  'item_not_proposed', 'habit_required', 'habit_needs_photo', 'proposer_habit_unavailable', 'not_proposer', 'last_item',
]

describe('mapChallengeError', () => {
  it('has Spanish copy for every code, all distinct', () => {
    const seen = new Set<string>()
    for (const code of CODES) {
      const msg = mapChallengeError(code)
      expect(msg, code).not.toBe(GENERIC_ERROR)
      expect(CHALLENGE_ERRORS[code], code).toBe(msg)
      seen.add(msg)
    }
    expect(seen.size).toBeGreaterThanOrEqual(CODES.length - 2)
  })

  it('exact match wins: habit_invalid is not rival_habit_invalid', () => {
    expect(mapChallengeError('habit_invalid')).toBe(CHALLENGE_ERRORS.habit_invalid)
    expect(mapChallengeError('rival_habit_invalid')).toBe(CHALLENGE_ERRORS.rival_habit_invalid)
    expect(CHALLENGE_ERRORS.habit_invalid).not.toBe(CHALLENGE_ERRORS.rival_habit_invalid)
  })

  it('falls back to a substring match, longest code first', () => {
    expect(mapChallengeError('P0001: rival_habit_invalid (ctx)')).toBe(CHALLENGE_ERRORS.rival_habit_invalid)
    expect(mapChallengeError('error: habit_invalid')).toBe(CHALLENGE_ERRORS.habit_invalid)
    expect(mapChallengeError('x challenge_not_found y')).toBe(CHALLENGE_ERRORS.challenge_not_found)
  })

  it('uses the generic copy for unknown or missing messages', () => {
    expect(mapChallengeError(undefined)).toBe(GENERIC_ERROR)
    expect(mapChallengeError('boom')).toBe(GENERIC_ERROR)
  })

  it('explains the ending case in the words of the spec', () => {
    expect(CHALLENGE_ERRORS.challenge_ending).toContain('No queda un periodo completo para empezar este sub-reto')
  })
})
