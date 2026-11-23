/**
 * FundTotals: registered, paid and pending amounts of the group's fund.
 * Props: `totals: GroupFundTotals` (never rendered for a failed read: the parent shows `LoadFailed`).
 * Short amounts share one row of three; when the longest does not fit (`totalsFit`) they restack,
 * one per line with the label left and the amount right. An amount is never truncated.
 */
import { formatCLP } from "@/domain/ledger";
import type { GroupFundTotals } from "@/lib/groups-fines-contract";
import { totalsFit } from "./fund-logic";

export function FundTotals({ totals }: { totals: GroupFundTotals }) {
  const cells = [
    { label: "Registrado", value: totals.registered },
    { label: "Pagado", value: totals.paid },
    { label: "Pendiente", value: totals.pending },
  ];
  if (!totalsFit(totals))
    return (
      <dl className="flex flex-col gap-2">
        {cells.map((c) => (
          <div key={c.label} className="flex items-baseline justify-between gap-3 rounded-md bg-field px-3 py-2">
            <dt className="text-small text-muted">{c.label}</dt>
            <dd className="min-w-0 break-all text-right font-mono text-body font-medium text-ink">{formatCLP(c.value)}</dd>
          </div>
        ))}
      </dl>
    );
  return (
    <dl className="grid grid-cols-3 gap-2">
      {cells.map((c) => (
        <div key={c.label} className="flex min-w-0 flex-col gap-1 rounded-md bg-field px-3 py-2">
          <dt className="text-small text-muted">{c.label}</dt>
          <dd className="font-mono text-body font-medium text-ink">{formatCLP(c.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
