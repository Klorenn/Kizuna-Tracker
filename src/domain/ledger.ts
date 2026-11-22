export type Debt = {
  id: string
  debtorId: string
  creditorId: string
  amount: number
  paidAt: string | null
}

/** Positive = the friend owes me. Only unpaid debts; zero balances omitted. */
export function netBalances(debts: Debt[], me: string): Map<string, number> {
  const balances = new Map<string, number>()
  for (const d of debts) {
    if (d.paidAt !== null) continue
    if (d.creditorId === me) {
      balances.set(d.debtorId, (balances.get(d.debtorId) ?? 0) + d.amount)
    } else if (d.debtorId === me) {
      balances.set(d.creditorId, (balances.get(d.creditorId) ?? 0) - d.amount)
    }
  }
  for (const [k, v] of balances) if (v === 0) balances.delete(k)
  return balances
}

const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' })

export function formatCLP(amount: number): string {
  // Normalize NBSP variants Intl may emit between symbol and digits.
  return clp.format(amount).replace(/\s/g, '')
}
