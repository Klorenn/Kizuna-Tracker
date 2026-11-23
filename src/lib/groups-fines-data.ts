import { isUuid } from '@/domain/groups'
import type { GroupLoaded } from '@/lib/groups-contract'
import { Malformed, bool, boolOrNull, list, notFound, personOf, row, run, str, strOrNull } from '@/lib/groups-data'
import type { Row } from '@/lib/groups-data'
import type {
  GroupFineActive,
  GroupFineProposal,
  GroupFineState,
  GroupFund,
  GroupFundDebt,
  GroupFundPerson,
  GroupRejectedItem,
  MyFundDebts,
} from '@/lib/groups-fines-contract'
import * as rpc from '@/lib/groups-fines-rpc'
import type { GroupsClient } from '@/lib/groups-rpc'

/**
 * Loaders of the optional fine: server-side reads over the fine RPCs (through `groups-fines-rpc`), mapped to the contract types.
 * The strict readers, the runner and the not-found state are the ones of `groups-data`. A failed call, a thrown call or a payload
 * that does not have the expected shape is an error state: never zeros, never an empty list (money shown as zero by mistake is a
 * defect). `group_not_found` / `not_group_member` are the not-found state.
 * Every loader takes an optional client (a server action that already checked the session passes its own).
 */

const COPY = {
  state: 'No pudimos cargar la multa. Inténtalo de nuevo.',
  fund: 'No pudimos cargar el fondo. Inténtalo de nuevo.',
  mine: 'No pudimos cargar los fondos de grupo. Inténtalo de nuevo.',
  rejected: 'No pudimos cargar las fotos rechazadas. Inténtalo de nuevo.',
} as const

// fine-specific readers ------------------------------------------------------------------------------------------------

/** A whole number of pesos or a count: never negative, never fractional, never missing. */
function whole(o: Row, k: string): number {
  const v = o[k]
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new Malformed(k)
  return v
}
function uuid(o: Row, k: string): string {
  const v = o[k]
  if (!isUuid(v)) throw new Malformed(k)
  return v
}
/** The key must be present (null is an answer, an absent key is not). */
function present(o: Row, k: string): unknown {
  if (!(k in o)) throw new Malformed(k)
  return o[k]
}
// loaders --------------------------------------------------------------------------------------------------------------

function activeOf(v: unknown): GroupFineActive | null {
  if (v === null) return null
  const o = row(v)
  return {
    id: uuid(o, 'id'),
    amount: whole(o, 'amount'),
    purpose: str(o, 'purpose'),
    startsOn: str(o, 'starts_on'),
    endsOn: strOrNull(o, 'ends_on'),
    boundCount: whole(o, 'bound_count'),
    iAmBound: bool(o, 'i_am_bound'),
    myBoundFrom: strOrNull(o, 'my_bound_from'),
    myBoundUntil: strOrNull(o, 'my_bound_until'),
  }
}

function proposalOf(v: unknown): GroupFineProposal | null {
  if (v === null) return null
  const o = row(v)
  return {
    id: uuid(o, 'id'),
    amount: whole(o, 'amount'),
    purpose: str(o, 'purpose'),
    proposedByName: str(o, 'proposed_by_name'),
    expiresAt: str(o, 'expires_at'),
    acceptedCount: whole(o, 'accepted_count'),
    neededCount: whole(o, 'needed_count'),
    myVote: boolOrNull(o, 'my_vote'),
  }
}

/** The fine of one group (`group_fine_state`): `GroupFineState`. `active` and `proposal` are null when there is none (a valid state); a failed or malformed read is `ok: false`. */
export function loadGroupFineState(groupId: string, client?: GroupsClient): Promise<GroupLoaded<GroupFineState>> {
  if (!isUuid(groupId)) return Promise.resolve(notFound())
  return run(client, COPY.state, (c) => rpc.groupFineState(c, groupId), (data) => {
    const o = row(data)
    return {
      active: activeOf(present(o, 'active')),
      proposal: proposalOf(present(o, 'proposal')),
      singleAdmin: bool(o, 'single_admin'),
    }
  })
}

/** The group's fund (`group_fund`): `GroupFund` = totals, people with pending debt, and the newest 100 debts. Every total must be present: there is no default of zero. */
export function loadGroupFund(groupId: string, client?: GroupsClient): Promise<GroupLoaded<GroupFund>> {
  if (!isUuid(groupId)) return Promise.resolve(notFound())
  return run(client, COPY.fund, (c) => rpc.groupFund(c, groupId), (data) => {
    const o = row(data)
    const t = row(o.totals)
    return {
      totals: { registered: whole(t, 'registered'), paid: whole(t, 'paid'), pending: whole(t, 'pending') },
      people: list(o.people).map((p): GroupFundPerson => ({ ...personOf(p), pending: whole(p, 'pending') })),
      debts: list(o.debts).map(
        (d): GroupFundDebt => ({
          ...personOf(d),
          debtId: uuid(d, 'debt_id'),
          weekStart: str(d, 'week_start'),
          amount: whole(d, 'amount'),
          paidAt: strOrNull(d, 'paid_at'),
          paidByName: strOrNull(d, 'paid_by_name'),
          mine: bool(d, 'mine'),
        }),
      ),
    }
  })
}

/** What the caller owes to funds and what is pending in the funds they administer (`my_fund_debts`): `MyFundDebts`. */
export function loadMyFundDebts(client?: GroupsClient): Promise<GroupLoaded<MyFundDebts>> {
  const rows = (v: unknown) =>
    list(v).map((r) => ({ groupId: uuid(r, 'group_id'), groupName: str(r, 'group_name'), pending: whole(r, 'pending') }))
  return run(client, COPY.mine, (c) => rpc.myFundDebts(c), (data) => {
    const o = row(data)
    return { owed: rows(o.owed), administered: rows(o.administered) }
  })
}

/** Photos rejected in weeks not yet closed (`group_rejected_checkins`): `GroupRejectedItem[]`. Admins see all; an owner sees their own. */
export function loadGroupRejected(groupId: string, client?: GroupsClient): Promise<GroupLoaded<GroupRejectedItem[]>> {
  if (!isUuid(groupId)) return Promise.resolve(notFound())
  return run(client, COPY.rejected, (c) => rpc.groupRejectedCheckins(c, groupId), (data) =>
    list(data).map(
      (o): GroupRejectedItem => ({
        ...personOf(o),
        checkinId: uuid(o, 'checkin_id'),
        localDate: str(o, 'local_date'),
        photoPath: strOrNull(o, 'photo_path'),
        reason: str(o, 'reason'),
        rejectedByName: str(o, 'rejected_by_name'),
        rejectedAt: str(o, 'rejected_at'),
      }),
    ),
  )
}
