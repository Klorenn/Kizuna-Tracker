/**
 * FundTotals: registered, paid and pending amounts of the group's fund.
 * Props: `totals: GroupFundTotals` (never rendered for a failed read: the parent shows `LoadFailed`).
 * A wrapping flex: every item is at least as wide as its content (`min-w-fit`) and its amount never
 * breaks (`whitespace-nowrap`), so when three do not fit a row the item moves to the next line.
 * No amount can overlap its neighbour, be cut or leave its cell at any width.
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
    <dl className="flex flex-wrap gap-2">
      {cells.map((c) => (
        <div key={c.label} className="flex min-w-fit flex-1 flex-col gap-1 rounded-md bg-field px-3 py-2">
          <dt className="text-small whitespace-nowrap text-muted">{c.label}</dt>
          <dd className="font-mono text-body font-medium whitespace-nowrap text-ink">{formatCLP(c.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
