import { describe, expect, it } from 'vitest'
import {
  FUND_DISCLAIMER,
  INVALID_FINE_COPY,
  INVALID_REASON_COPY,
  acceptedLabel,
  administeredLabel,
  boundSinceLabel,
  debtWeekLabel,
  fineHeadline,
  owedLabel,
  proposalHeadline,
  validateFineProposal,
  validateRejectReason,
} from '@/domain/group-fines'

describe('validateFineProposal', () => {
  it('accepts a whole amount in range and trims the purpose', () => {
    expect(validateFineProposal(2500, '  Asado de fin de mes ')).toEqual({ ok: true, amount: 2500, purpose: 'Asado de fin de mes' })
    expect(validateFineProposal(1, 'x')).toEqual({ ok: true, amount: 1, purpose: 'x' })
    expect(validateFineProposal(100000, 'x')).toEqual({ ok: true, amount: 100000, purpose: 'x' })
  })
  it.each([0, -5, 100001, 12.5, NaN, Infinity, '2500', null, undefined])('refuses the amount %s', (amount) => {
    expect(validateFineProposal(amount as number, 'Asado')).toEqual({ ok: false, error: INVALID_FINE_COPY })
  })
  it.each(['', '   ', 'x'.repeat(81), 5, null, undefined])('refuses the purpose %s', (purpose) => {
    expect(validateFineProposal(1000, purpose as string)).toEqual({ ok: false, error: INVALID_FINE_COPY })
  })
  it('counts characters as a person does (80 emoji pass, 81 do not)', () => {
    expect(validateFineProposal(1000, '🍖'.repeat(80)).ok).toBe(true)
    expect(validateFineProposal(1000, '🍖'.repeat(81)).ok).toBe(false)
  })
  it('the copy is the binding one', () => {
    expect(INVALID_FINE_COPY).toBe('El monto debe estar entre $1 y $100.000 y el fondo necesita un nombre.')
  })
})

describe('validateRejectReason', () => {
  it('trims and accepts 1..140', () => {
    expect(validateRejectReason('  foto borrosa ')).toEqual({ ok: true, reason: 'foto borrosa' })
    expect(validateRejectReason('x'.repeat(140)).ok).toBe(true)
  })
  it.each(['', '   ', 'x'.repeat(141), 7, null, undefined])('refuses %s', (r) => {
    expect(validateRejectReason(r as string)).toEqual({ ok: false, error: INVALID_REASON_COPY })
  })
  it('the copy is the binding one', () => {
    expect(INVALID_REASON_COPY).toBe('Escribe un motivo de hasta 140 letras.')
  })
})

describe('labels', () => {
  it('acceptedLabel', () => expect(acceptedLabel(2, 3)).toBe('Aceptaron 2 de 3 necesarios'))
  it('proposalHeadline', () => expect(proposalHeadline('Ana', 2500)).toBe('Ana propone una multa de $2.500 por semana incumplida'))
  it('fineHeadline', () => expect(fineHeadline(2500)).toBe('Multa activa: $2.500 por semana incumplida'))
  it('boundSinceLabel', () => expect(boundSinceLabel('2026-11-30')).toBe('Participas desde el lunes 30 de noviembre'))
  it('debtWeekLabel', () => expect(debtWeekLabel('2026-11-16', 5000)).toBe('Semana del 16 de noviembre · $5.000'))
  it('owedLabel', () => expect(owedLabel(3000, 'Gym')).toBe('Le debes $3.000 al fondo de Gym'))
  it('administeredLabel', () => expect(administeredLabel('Gym', 12000)).toBe('Gym: $12.000 pendiente en el fondo'))
  it('the disclaimer', () => expect(FUND_DISCLAIMER).toBe('La app solo registra. El pago se hace fuera de la app.'))
})
