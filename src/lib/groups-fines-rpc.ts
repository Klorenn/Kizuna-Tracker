import { callLoose } from '@/lib/groups-rpc'
import type { GroupsClient } from '@/lib/groups-rpc'

/**
 * The single seam over the fine RPCs of Grupos (migration 0025). The generated Supabase types do not know these functions,
 * so the calls are typed by hand here and nothing else in the app calls `supabase.rpc` for the fine.
 *
 * Every function returns the raw `{ data, error }` untouched: mapping rows and errors is the caller's job.
 * Reads return `jsonb` (an object, or an array for the rejected list); the loaders validate every field.
 */

const call = callLoose

// writes ---------------------------------------------------------------------------------------------------------------

/** Resolves the id of the new proposal. */
export const proposeGroupFine = (c: GroupsClient, groupId: string, amount: number, purpose: string) =>
  call<string>(c, 'propose_group_fine', { p_group_id: groupId, p_amount: amount, p_purpose: purpose })

export const voteGroupFine = (c: GroupsClient, fineId: string, accept: boolean) =>
  call<unknown>(c, 'vote_group_fine', { p_fine_id: fineId, p_accept: accept })

export const acceptGroupFine = (c: GroupsClient, groupId: string) => call<unknown>(c, 'accept_group_fine', { p_group_id: groupId })

export const leaveGroupFine = (c: GroupsClient, groupId: string) => call<unknown>(c, 'leave_group_fine', { p_group_id: groupId })

export const endGroupFine = (c: GroupsClient, groupId: string) => call<unknown>(c, 'end_group_fine', { p_group_id: groupId })

export const setGroupDebtPaid = (c: GroupsClient, debtId: string, paid: boolean) =>
  call<unknown>(c, 'set_group_debt_paid', { p_debt_id: debtId, p_paid: paid })

export const rejectGroupCheckin = (c: GroupsClient, groupId: string, checkinId: string, reason: string) =>
  call<unknown>(c, 'reject_group_checkin', { p_group_id: groupId, p_checkin_id: checkinId, p_reason: reason })

export const undoGroupCheckinRejection = (c: GroupsClient, groupId: string, checkinId: string) =>
  call<unknown>(c, 'undo_group_checkin_rejection', { p_group_id: groupId, p_checkin_id: checkinId })

// reads ----------------------------------------------------------------------------------------------------------------

export const groupFineState = (c: GroupsClient, groupId: string) => call<unknown>(c, 'group_fine_state', { p_group_id: groupId })

export const groupFund = (c: GroupsClient, groupId: string) => call<unknown>(c, 'group_fund', { p_group_id: groupId })

export const myFundDebts = (c: GroupsClient) => call<unknown>(c, 'my_fund_debts')

/** Admins only, plus the owner of each photo for their own. */
export const groupRejectedCheckins = (c: GroupsClient, groupId: string) => call<unknown>(c, 'group_rejected_checkins', { p_group_id: groupId })
