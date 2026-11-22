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
  // Intl puts the minus after the symbol ("$-5.000"); we want "-$5.000".
  const text = clp.format(Math.abs(amount)).replace(/\s/g, '')
  return amount < 0 ? `-${text}` : text
}

/** `+$3.000` / `-$1.500` / `$0`. Sign is always explicit for non-zero amounts. */
export function formatSignedCLP(amount: number): string {
  if (amount === 0) return formatCLP(0)
  return amount > 0 ? `+${formatCLP(amount)}` : formatCLP(amount)
}
