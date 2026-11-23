/**
 * Groups, the optional fine: types shared by the data layer, the server actions and the views.
 * Types and constants only. Do not add logic here.
 */
import type { GroupDate, GroupPerson, GroupResult } from "./groups-contract";

export const FINE_LIMITS = { amountMin: 1, amountMax: 100000, purposeMax: 80, voteDays: 7, rejectHours: 24, reasonMax: 140 } as const;

export type GroupFineActive = {
  id: string;
  /** Whole pesos per missed week. */
  amount: number;
  purpose: string;
  startsOn: GroupDate;
  /** Set when an admin ended it: the Monday from which it no longer applies. */
  endsOn: GroupDate | null;
  boundCount: number;
  iAmBound: boolean;
  myBoundFrom: GroupDate | null;
  myBoundUntil: GroupDate | null;
};

export type GroupFineProposal = {
  id: string;
  amount: number;
  purpose: string;
  proposedByName: string;
  expiresAt: string;
  acceptedCount: number;
  neededCount: number;
  /** Null while the caller has not voted. */
  myVote: boolean | null;
};

export type GroupFineState = {
  active: GroupFineActive | null;
  proposal: GroupFineProposal | null;
  /** True when the group has a single admin (their photos cannot be rejected). */
  singleAdmin: boolean;
};

export type GroupFundTotals = { registered: number; paid: number; pending: number };

export type GroupFundPerson = GroupPerson & { pending: number };

export type GroupFundDebt = GroupPerson & {
  debtId: string;
  weekStart: GroupDate;
  amount: number;
  paidAt: string | null;
  paidByName: string | null;
  mine: boolean;
};

export type GroupFund = { totals: GroupFundTotals; people: GroupFundPerson[]; debts: GroupFundDebt[] };

export type MyFundDebts = {
  owed: { groupId: string; groupName: string; pending: number }[];
  administered: { groupId: string; groupName: string; pending: number }[];
};

export type GroupRejectedItem = GroupPerson & {
  checkinId: string;
  localDate: GroupDate;
  photoPath: string | null;
  reason: string;
  rejectedByName: string;
  rejectedAt: string;
};

/** Server actions as the views receive them (passed down as props by the pages). */
export type GroupFineActions = {
  propose: (groupId: string, amount: number, purpose: string) => Promise<GroupResult<{ id: string }>>;
  vote: (fineId: string, accept: boolean) => Promise<GroupResult>;
  acceptActive: (groupId: string) => Promise<GroupResult>;
  stepOut: (groupId: string) => Promise<GroupResult>;
  end: (groupId: string) => Promise<GroupResult>;
  setDebtPaid: (debtId: string, paid: boolean) => Promise<GroupResult>;
  rejectPhoto: (groupId: string, checkinId: string, reason: string) => Promise<GroupResult>;
  undoRejectPhoto: (groupId: string, checkinId: string) => Promise<GroupResult>;
};
