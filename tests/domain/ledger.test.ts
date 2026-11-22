import { describe, expect, test } from 'vitest'
import { netBalances, formatCLP } from '@/domain/ledger'

describe('ledger', () => {
  test('compensa deudas cruzadas', () => {
    const debts = [
      { id: '1', debtorId: 'juan', creditorId: 'pau', amount: 10000, paidAt: null },
      { id: '2', debtorId: 'pau', creditorId: 'juan', amount: 5000, paidAt: null },
    ]
    expect(netBalances(debts, 'pau').get('juan')).toBe(5000)
  })
  test('ignora pagadas y omite saldo cero', () => {
    const debts = [
      { id: '1', debtorId: 'juan', creditorId: 'pau', amount: 5000, paidAt: null },
      { id: '2', debtorId: 'pau', creditorId: 'juan', amount: 5000, paidAt: null },
      { id: '3', debtorId: 'ana', creditorId: 'pau', amount: 3000, paidAt: '2026-11-20T00:00:00Z' },
    ]
    expect(netBalances(debts, 'pau').size).toBe(0)
  })
  test('formatCLP', () => {
    expect(formatCLP(5000)).toBe('$5.000')
  })
})
