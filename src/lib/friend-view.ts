import { formatCLP, netBalances } from '@/domain/ledger'
import { recordFromRows } from '@/lib/stats'

export type ViewerState = 'anon' | 'self' | 'friend' | 'incoming' | 'outgoing' | 'stranger'

type FriendshipRow = { requester_id: string; addressee_id: string; status: string }

/** Who is looking at /@handle: decides between the rich friend view and the public one. */
export function viewerState(viewerId: string | null, targetId: string, f: FriendshipRow | null): ViewerState {
  if (!viewerId) return 'anon'
  if (viewerId === targetId) return 'self'
  const pair =
    f &&
    ((f.requester_id === viewerId && f.addressee_id === targetId) ||
      (f.requester_id === targetId && f.addressee_id === viewerId))
  if (!f || !pair) return 'stranger'
  if (f.status === 'accepted') return 'friend'
  return f.addressee_id === viewerId ? 'incoming' : 'outgoing'
}

type ChallengeRow = { id: string; creator_id: string; rival_id: string; status: string }
type DebtRow = {
  challenge_id: string
  debtor_id: string
  creditor_id: string
  amount: number
  paid_at: string | null
}

const between = (a: string, b: string, x: string, y: string) => (x === a && y === b) || (x === b && y === a)

/**
 * Head-to-head between me and one friend: finished challenges won/lost (same rule as the Perfil
 * record) and the unpaid balance (positive = they owe me).
 */
export function pairRecord(
  me: string,
  other: string,
  challenges: ChallengeRow[],
  debts: DebtRow[],
): { won: number; lost: number; balance: number } {
  const ours = challenges.filter((c) => between(me, other, c.creator_id, c.rival_id))
  const ourDebts = debts.filter((d) => between(me, other, d.debtor_id, d.creditor_id))
  const { won, lost } = recordFromRows(me, ours, ourDebts)
  const balance =
    netBalances(
      ourDebts.map((d, i) => ({
        id: String(i),
        debtorId: d.debtor_id,
        creditorId: d.creditor_id,
        amount: d.amount,
        paidAt: d.paid_at,
      })),
      me,
    ).get(other) ?? 0
  return { won, lost, balance }
}

/** "Beto te debe $2.500" / "Le debes $2.500 a Beto"; null when you are even. */
export function balanceCopy(balance: number, name: string): string | null {
  if (balance > 0) return `${name} te debe ${formatCLP(balance)}`
  if (balance < 0) return `Le debes ${formatCLP(-balance)} a ${name}`
  return null
}

/** Friends list status line. */
export function friendStatusText(s: { value: number; unit: 'days' | 'weeks'; capped?: boolean }): string {
  if (s.value <= 0) return 'Sin racha activa'
  const unit = s.unit === 'weeks' ? (s.value === 1 ? 'semana' : 'semanas') : s.value === 1 ? 'día' : 'días'
  return `Racha de ${s.value}${s.capped ? '+' : ''} ${unit}`
}
