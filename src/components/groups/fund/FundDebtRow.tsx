"use client";

/**
 * FundDebtRow: one recorded debt of the fund.
 * Props: `debt: GroupFundDebt`, `canMark` (the parent decides with `canMarkPaid`: when false the
 * control is absent, not disabled), `pending` (this row's request is running), `error` (this row's
 * server error or null), `onToggle(debt)` (marks it paid, or unmarks it when already paid).
 * The status is text plus an icon ("Pendiente" never relies on colour); the status line and the
 * control keep one fixed height, so marking a debt does not move the list.
 */
import { Check, Clock } from "@phosphor-icons/react";
import { memo } from "react";
import { Button } from "@/components/ui/Button";
import { formatCLP } from "@/domain/ledger";
import { dayMonthLabel } from "@/lib/challenge-view";
import type { GroupFundDebt } from "@/lib/groups-fines-contract";
import { ErrorLine, PersonLink } from "../detail/parts";
import { debtStatusText } from "./fund-logic";

export const FundDebtRow = memo(function FundDebtRow({
  debt,
  canMark,
  pending,
  error,
  onToggle,
}: {
  debt: GroupFundDebt;
  canMark: boolean;
  pending: boolean;
  error: string | null;
  onToggle: (debt: GroupFundDebt) => void;
}) {
  const paid = debt.paidAt !== null;
  const Icon = paid ? Check : Clock;
  return (
    <li className="flex flex-col gap-1 px-4 py-2">
      <PersonLink
        person={debt}
        you={debt.mine}
        detail={
          <span className="truncate text-small text-muted">
            Semana del {dayMonthLabel(debt.weekStart)} · <span className="font-mono">{formatCLP(debt.amount)}</span>
          </span>
        }
      />
      <div className="flex min-h-11 items-center gap-2">
        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-small font-medium text-ink">
          <Icon size={16} weight="light" className="shrink-0" aria-hidden />
          <span className="truncate">{debtStatusText(debt)}</span>
        </span>
        {canMark ? (
          <Button
            variant="secondary"
            disabled={pending}
            aria-busy={pending}
            onClick={() => onToggle(debt)}
            className="h-11! w-auto! shrink-0 px-4!"
          >
            {paid ? "Desmarcar" : "Marcar como pagada"}
          </Button>
        ) : null}
      </div>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
    </li>
  );
});
