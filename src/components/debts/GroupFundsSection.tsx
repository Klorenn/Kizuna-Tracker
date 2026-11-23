/**
 * GroupFundsSection: "Fondos de grupo" for the Deudas page, apart from the pairwise balances.
 *
 * Props: `data: MyFundDebts | null` (null = the read failed: `LoadFailed`, never a $0).
 * Shows what the caller owes to each group's fund ("Le debes $X al fondo de <grupo>") and, for the
 * groups they administer, what is pending ("<grupo>: $X pendiente en el fondo"). Rows with nothing
 * pending are left out; with nothing to show the section is absent. Each row links to that group's fund.
 * A server-safe component (no state, no client hooks): the page can render it directly.
 */
import Link from "next/link";
import { LoadFailed } from "@/components/LoadFailed";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatCLP } from "@/domain/ledger";
import { RULE_LINE } from "@/components/groups/fund/fund-logic";
import type { MyFundDebts } from "@/lib/groups-fines-contract";

const ROW = "flex min-h-11 items-center px-4 py-2 text-body text-pretty break-words text-ink hover:bg-field";

export function GroupFundsSection({ data }: { data: MyFundDebts | null }) {
  if (data === null)
    return (
      <section aria-label="Fondos de grupo" className="flex flex-col gap-2">
        <SectionHeader label="Fondos de grupo" />
        <LoadFailed href="/deudas" />
      </section>
    );

  const owed = data.owed.filter((g) => g.pending > 0);
  const administered = data.administered.filter((g) => g.pending > 0);
  if (owed.length === 0 && administered.length === 0) return null;

  return (
    <section aria-label="Fondos de grupo" className="flex flex-col gap-2">
      <SectionHeader label="Fondos de grupo" />
      <Card>
        <ul className="divide-y divide-line">
          {owed.map((g) => (
            <li key={`owed-${g.groupId}`}>
              <Link href={`/grupos/${g.groupId}?seccion=fondo`} className={ROW}>
                <span className="min-w-0">
                  Le debes <span className="font-mono font-medium">{formatCLP(g.pending)}</span> al fondo de {g.groupName}
                </span>
              </Link>
            </li>
          ))}
          {administered.map((g) => (
            <li key={`admin-${g.groupId}`}>
              <Link href={`/grupos/${g.groupId}?seccion=fondo`} className={ROW}>
                <span className="min-w-0">
                  {g.groupName}: <span className="font-mono font-medium">{formatCLP(g.pending)}</span> pendiente en el fondo
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-small text-pretty text-muted">{RULE_LINE}</p>
    </section>
  );
}
