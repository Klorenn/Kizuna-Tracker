/**
 * Pure helpers of the fund views (no React, no I/O): proposal validation, the single-flight
 * wrapper around an action, vote bookkeeping, role gating of the payment mark and the copy lines.
 */
import { formatCLP } from "@/domain/ledger";
import { dayMonthLabel } from "@/lib/challenge-view";
import type { GroupDate, GroupResult, GroupRole } from "@/lib/groups-contract";
import { FINE_LIMITS } from "@/lib/groups-fines-contract";
import type {
  GroupFineActive,
  GroupFineProposal,
  GroupFund,
  GroupFundDebt,
} from "@/lib/groups-fines-contract";
import type { createRunner } from "../detail/group-logic";

export const RULE_LINE = "La app solo registra. El pago se hace fuera de la app.";

/* ---------------------------------- proposal ---------------------------------- */

const INVALID_FINE = "El monto debe estar entre $1 y $100.000 y el fondo necesita un nombre.";

/** Whole pesos typed the es-CL way ("2.500", "$2500"): anything that is not digits is rejected. */
export function parseAmount(text: string): number | null {
  const digits = text.trim().replace(/^\$/, "").replace(/\./g, "").replace(/\s/g, "");
  return /^\d{1,9}$/.test(digits) ? Number(digits) : null;
}

export function prepareProposal(
  f: { amount: string; purpose: string },
): { ok: true; amount: number; purpose: string } | { ok: false; error: string } {
  const amount = parseAmount(f.amount);
  const purpose = f.purpose.trim();
  if (
    amount === null ||
    amount < FINE_LIMITS.amountMin ||
    amount > FINE_LIMITS.amountMax ||
    purpose.length === 0 ||
    purpose.length > FINE_LIMITS.purposeMax
  )
    return { ok: false, error: INVALID_FINE };
  return { ok: true, amount, purpose };
}

/* ---------------------------------- actions ---------------------------------- */

type Runner = ReturnType<typeof createRunner>;

/**
 * Runs one action through the single-flight runner and tells the caller on success.
 * `null`: another action was already running and this call was ignored.
 */
export async function runAndNotify<T>(
  runner: Runner,
  fn: () => Promise<GroupResult<T>>,
  onOk?: (data: T) => void,
): Promise<GroupResult<T> | null> {
  const r = await runner.run(fn);
  if (r?.ok) onOk?.(r.data);
  return r;
}

/* ------------------------------------ vote ------------------------------------ */

export const voteStatus = (myVote: boolean | null): string | null =>
  myVote === null ? null : myVote ? "Aceptaste" : "No participas";

/** What the server accepted, shown at once: the caller's vote and the count moved by the change only. */
export function applyVote(p: GroupFineProposal, accept: boolean): GroupFineProposal {
  const before = p.myVote === true ? 1 : 0;
  const after = accept ? 1 : 0;
  return { ...p, myVote: accept, acceptedCount: Math.max(0, p.acceptedCount + after - before) };
}

export const proposalTitle = (p: Pick<GroupFineProposal, "proposedByName" | "amount">): string =>
  `${p.proposedByName} propone una multa de ${formatCLP(p.amount)} por semana incumplida`;

export const acceptedLine = (p: Pick<GroupFineProposal, "acceptedCount" | "neededCount">): string =>
  `Aceptaron ${p.acceptedCount} de ${p.neededCount} necesarios`;

/* ----------------------------------- active ----------------------------------- */

export const activeTitle = (a: Pick<GroupFineActive, "amount">): string =>
  `Multa activa: ${formatCLP(a.amount)} por semana incumplida`;

const mondayLabel = (d: GroupDate) => `lunes ${dayMonthLabel(d)}`;

export function participationLine(
  a: Pick<GroupFineActive, "iAmBound" | "myBoundFrom" | "myBoundUntil">,
): string {
  if (!a.iAmBound) return "No participas";
  if (a.myBoundUntil) return `Participas hasta el ${mondayLabel(a.myBoundUntil)}`;
  return a.myBoundFrom ? `Participas desde el ${mondayLabel(a.myBoundFrom)}` : "Participas";
}

/* ------------------------------------ debts ------------------------------------ */

export const debtWeekLine = (d: Pick<GroupFundDebt, "weekStart" | "amount">): string =>
  `Semana del ${dayMonthLabel(d.weekStart)} · ${formatCLP(d.amount)}`;

export function debtStatusText(d: Pick<GroupFundDebt, "paidAt" | "paidByName">): string {
  if (!d.paidAt) return "Pendiente";
  return d.paidByName ? `Pagada · marcó ${d.paidByName}` : "Pagada";
}

/**
 * What the server accepted, shown at once: the debt marked (or unmarked), the totals and the
 * debtor's pending amount moved by that debt only. Returns the same object when nothing changes.
 */
export function applyDebtPaid(fund: GroupFund, debtId: string, paid: boolean, at: string = new Date().toISOString()): GroupFund {
  const debt = fund.debts.find((d) => d.debtId === debtId);
  if (!debt || (debt.paidAt !== null) === paid) return fund;
  const sign = paid ? -1 : 1;
  const people = fund.people.some((p) => p.userId === debt.userId)
    ? fund.people.map((p) => (p.userId === debt.userId ? { ...p, pending: p.pending + sign * debt.amount } : p))
    : [
        ...fund.people,
        {
          userId: debt.userId,
          username: debt.username,
          displayName: debt.displayName,
          avatarPath: debt.avatarPath,
          avatarPreset: debt.avatarPreset,
          pending: debt.amount,
        },
      ];
  return {
    totals: {
      registered: fund.totals.registered,
      paid: fund.totals.paid - sign * debt.amount,
      pending: fund.totals.pending + sign * debt.amount,
    },
    people: people.filter((p) => p.pending > 0),
    debts: fund.debts.map((d) => (d.debtId === debtId ? { ...d, paidAt: paid ? at : null, paidByName: null } : d)),
  };
}

/**
 * "Marcar como pagada" is for admins of a live group; absent (not disabled) on the admin's own
 * debt unless they are the group's only admin.
 */
export function canMarkPaid(a: {
  role: GroupRole;
  archived: boolean;
  debt: Pick<GroupFundDebt, "userId" | "mine">;
  myUserId: string;
  singleAdmin: boolean;
}): boolean {
  if (a.role !== "admin" || a.archived) return false;
  const own = a.debt.mine || a.debt.userId === a.myUserId;
  return !own || a.singleAdmin;
}
