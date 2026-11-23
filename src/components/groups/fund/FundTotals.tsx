/**
 * FundTotals: registered, paid and pending amounts of the group's fund.
 * Props: `totals: GroupFundTotals` (never rendered for a failed read: the parent shows `LoadFailed`).
 */
import { formatCLP } from "@/domain/ledger";
import type { GroupFundTotals } from "@/lib/groups-fines-contract";

export function FundTotals({ totals }: { totals: GroupFundTotals }) {
  const cells = [
    { label: "Registrado", value: totals.registered },
    { label: "Pagado", value: totals.paid },
    { label: "Pendiente", value: totals.pending },
  ];
  return (
    <dl className="grid grid-cols-3 gap-2">
      {cells.map((c) => (
        <div key={c.label} className="flex min-w-0 flex-col gap-1 rounded-md bg-field px-3 py-2">
          <dt className="truncate text-small text-muted">{c.label}</dt>
          <dd className="truncate font-mono text-body font-medium text-ink">{formatCLP(c.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
