import { describe, expect, it } from 'vitest'
import { debtReason, type FailedItemRow } from '@/lib/debt-reason'

const challenge = {
  id: 'c1',
  creator_id: 'ana',
  frequency_type: 'weekly',
  target_per_week: 3,
  weeks: 4,
  starts_on: '2026-11-02',
  creator_habit: { name: 'Gimnasio' },
  rival_habit: { name: 'Correr' },
}
const debt = (debtor_id: string, period_start = '2026-11-09') => ({ challenge_id: 'c1', debtor_id, period_start })
const failed = (player_id: string, creator: string | null, rival: string | null, period_start = '2026-11-09'): FailedItemRow => ({
  challenge_id: 'c1',
  period_start,
  player_id,
  item: { creator_habit: creator ? { name: creator } : null, rival_habit: rival ? { name: rival } : null },
})

describe('debtReason', () => {
  it('names every sub-reto the debtor failed, with the period position', () => {
    const rows = [failed('ana', 'Agua', 'Beber'), failed('ana', 'Gym', 'Pesas'), failed('bo', 'Otro', 'Otro2')]
    expect(debtReason(debt('ana'), challenge, rows)).toBe('Agua, Gym · semana 2')
  })

  it('uses the rival side habit names when the rival is the debtor', () => {
    expect(debtReason(debt('bo'), challenge, [failed('bo', 'Agua', 'Beber')])).toBe('Beber · semana 2')
  })

  it('falls back to the legacy primary habit when the period has no item results (pre sub-retos)', () => {
    expect(debtReason(debt('ana'), challenge, [])).toBe('Gimnasio · semana 2')
    expect(debtReason(debt('bo'), challenge, [failed('bo', 'x', 'y', '2026-11-16')])).toBe('Correr · semana 2')
  })

  it('falls back too when the failed habit names are unreadable', () => {
    expect(debtReason(debt('bo'), challenge, [failed('bo', null, null)])).toBe('Correr · semana 2')
  })

  it('lists a name once even if two rows share it', () => {
    expect(debtReason(debt('ana'), challenge, [failed('ana', 'Agua', null), failed('ana', 'Agua', null)])).toBe('Agua · semana 2')
  })

  it('has no position when the period is unknown, and a plain "Reto" without the challenge', () => {
    expect(debtReason(debt('ana', '2026-12-30'), challenge, [])).toBe('Gimnasio')
    expect(debtReason(debt('ana'), undefined, [])).toBe('Reto')
  })

  it('daily challenges say "día"', () => {
    const daily = { ...challenge, frequency_type: 'daily', target_per_week: null, weeks: 1 }
    expect(debtReason(debt('ana', '2026-11-03'), daily, [])).toBe('Gimnasio · día 2')
  })
})
