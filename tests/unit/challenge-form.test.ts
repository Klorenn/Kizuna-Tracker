import { describe, expect, it } from 'vitest'
import {
  formModeFor,
  termsFromExisting,
  termsSummary,
  openTermsByRival,
  parseRetoParam,
  resolveAddMode,
  parseNewChallengeParams,
  parseRivalParam,
  validateAddItemInput,
  validateChallengeInput,
} from '@/lib/challenge-form'

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

describe('parseRivalParam', () => {
  it('preselects a friend from ?amigo=<id> (uuid only)', () => {
    expect(parseRivalParam('a0000000-0000-0000-0000-00000000000b')).toBe('a0000000-0000-0000-0000-00000000000b')
  })
  it('ignores anything else', () => {
    expect(parseRivalParam(undefined)).toBeNull()
    expect(parseRivalParam('user_b')).toBeNull()
    expect(parseRivalParam(['a0000000-0000-0000-0000-00000000000b'])).toBeNull()
  })
})

const row = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  creator_id: 'me',
  rival_id: 'ana',
  status: 'active',
  frequency_type: 'weekly',
  target_per_week: 3,
  weeks: 6,
  fine_amount: 4500,
  starts_on: '2026-11-30',
  timezone: 'America/Santiago',
  ...over,
})

describe('openTermsByRival', () => {
  it('maps the other person to the terms of the open challenge, newest first wins', () => {
    const out = openTermsByRival(
      [row(), row({ id: 'c0', creator_id: 'ana', rival_id: 'me', status: 'proposed' }), row({ id: 'cx', rival_id: 'zed', frequency_type: 'daily', target_per_week: null })],
      'me',
    )
    expect(out.ana).toEqual({
      id: 'c1',
      status: 'active',
      frequency: { type: 'weekly', target: 3 },
      weeks: 6,
      fineAmount: 4500,
      startsOn: '2026-11-30',
      timezone: 'America/Santiago',
      canAdd: true,
    })
    expect(out.zed.frequency).toEqual({ type: 'daily' })
  })

  it('ignores closed challenges', () => {
    expect(openTermsByRival([row({ status: 'cancelled' }), row({ status: 'finished' })], 'me')).toEqual({})
  })

  it('keeps a null starts_on for a proposed challenge', () => {
    expect(openTermsByRival([row({ status: 'proposed', starts_on: null })], 'me').ana.startsOn).toBeNull()
  })
})

describe('openTermsByRival canAdd', () => {
  it('active: either player adds', () => {
    expect(openTermsByRival([row({ creator_id: 'ana', rival_id: 'me' })], 'me').ana.canAdd).toBe(true)
  })
  it('proposed: only the creator adds (add_challenge_item raises not_creator for the rival)', () => {
    expect(openTermsByRival([row({ status: 'proposed' })], 'me').ana.canAdd).toBe(true)
    expect(openTermsByRival([row({ status: 'proposed', creator_id: 'ana', rival_id: 'me' })], 'me').ana.canAdd).toBe(false)
  })
})

describe('parseRetoParam', () => {
  it('accepts a uuid, lowercased, and nothing else', () => {
    expect(parseRetoParam('A0000000-0000-4000-8000-00000000000C')).toBe('a0000000-0000-4000-8000-00000000000c')
    expect(parseRetoParam('x,or(1)')).toBeNull()
    expect(parseRetoParam(undefined)).toBeNull()
    expect(parseRetoParam(['a'])).toBeNull()
  })
})

describe('resolveAddMode (?reto= or a friend with an open challenge)', () => {
  const terms = openTermsByRival([row({ id: 'c1' }), row({ id: 'c2', rival_id: 'zed' })], 'me')
  it('?reto= picks that challenge and its rival', () => {
    expect(resolveAddMode(terms, { reto: 'c2', rival: null })).toEqual({ rivalId: 'zed', terms: terms.zed })
  })
  it('?reto= wins over ?amigo=', () => {
    expect(resolveAddMode(terms, { reto: 'c2', rival: 'ana' })?.rivalId).toBe('zed')
  })
  it('a friend with an open challenge is add mode too', () => {
    expect(resolveAddMode(terms, { reto: null, rival: 'ana' })).toEqual({ rivalId: 'ana', terms: terms.ana })
  })
  it('unknown challenge, closed challenge or no open challenge: normal mode', () => {
    expect(resolveAddMode(terms, { reto: 'nope', rival: null })).toBeNull()
    expect(resolveAddMode(terms, { reto: null, rival: 'other' })).toBeNull()
    expect(resolveAddMode(terms, { reto: null, rival: null })).toBeNull()
  })
  it('a challenge the viewer cannot add to (proposed by the other) is not add mode', () => {
    const t = openTermsByRival([row({ status: 'proposed', creator_id: 'ana', rival_id: 'me' })], 'me')
    expect(resolveAddMode(t, { reto: 'c1', rival: null })).toBeNull()
  })
})

describe('validateAddItemInput', () => {
  const H = 'a0000000-0000-4000-8000-00000000000b'
  const C = 'a0000000-0000-4000-8000-00000000000c'
  it('accepts a weekly target 1..7 and a daily null target', () => {
    expect(validateAddItemInput({ challengeId: C, habitId: H, target: 3 }, 'weekly')).toEqual({ ok: true })
    expect(validateAddItemInput({ challengeId: C, habitId: H, target: null }, 'daily')).toEqual({ ok: true })
  })
  it('rejects a bad target for the frequency', () => {
    for (const target of [0, 8, 1.5, null]) {
      expect(validateAddItemInput({ challengeId: C, habitId: H, target }, 'weekly').ok).toBe(false)
    }
    expect(validateAddItemInput({ challengeId: C, habitId: H, target: 3 }, 'daily').ok).toBe(false)
  })
  it('rejects ids that are not uuids', () => {
    expect(validateAddItemInput({ challengeId: 'x', habitId: H, target: null }, 'daily').ok).toBe(false)
    expect(validateAddItemInput({ challengeId: C, habitId: 'x,or(1)', target: null }, 'daily').ok).toBe(false)
  })
})

describe('formModeFor', () => {
  const t = (o = {}) => ({
    id: 'c1',
    status: 'active',
    frequency: { type: 'daily' as const },
    weeks: 4,
    fineAmount: 1000,
    startsOn: null,
    timezone: 'America/Santiago',
    canAdd: true,
    ...o,
  })
  it('no rival or no open challenge: a new challenge', () => {
    expect(formModeFor({}, '')).toEqual({ mode: 'new' })
    expect(formModeFor({ ana: t() }, 'zed')).toEqual({ mode: 'new' })
  })
  it('an open challenge I can add to: add mode with its terms', () => {
    expect(formModeFor({ ana: t() }, 'ana')).toEqual({ mode: 'add', terms: t() })
  })
  it('an open challenge I cannot add to: blocked, pointing at it', () => {
    expect(formModeFor({ ana: t({ canAdd: false }) }, 'ana')).toEqual({ mode: 'blocked', challengeId: 'c1' })
  })
})

describe('termsSummary', () => {
  const t = (o = {}) => ({
    id: 'c1',
    status: 'active',
    frequency: { type: 'weekly' as const, target: 3 },
    weeks: 4,
    fineAmount: 2500,
    startsOn: null,
    timezone: 'America/Santiago',
    canAdd: true,
    ...o,
  })
  it('weekly: frequency, weeks and fine', () => {
    expect(termsSummary(t())).toEqual(['3 por semana', '4 semanas', '$2.500'])
  })
  it('daily, one week', () => {
    expect(termsSummary(t({ frequency: { type: 'daily' }, weeks: 1 }))).toEqual(['Diario', '1 semana', '$2.500'])
  })
})

describe('termsFromExisting', () => {
  it('builds add terms from the server "exists" answer: only an active challenge accepts sub-retos', () => {
    const terms = { status: 'active', frequency: { type: 'daily' as const }, weeks: 2, fineAmount: 1000 }
    expect(termsFromExisting('c9', terms)).toMatchObject({ id: 'c9', status: 'active', weeks: 2, canAdd: true })
    expect(termsFromExisting('c9', { ...terms, status: 'proposed' }).canAdd).toBe(false)
  })
})
