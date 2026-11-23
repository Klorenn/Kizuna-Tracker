"use client";

/**
 * FundPeople: the active members who owe something to the fund ("Debe $X").
 * Props: `people: GroupFundPerson[]`. Of each person: name, @usuario, avatar and the pending amount.
 * Renders nothing for an empty list.
 */
import { formatCLP } from "@/domain/ledger";
import type { GroupFundPerson } from "@/lib/groups-fines-contract";
import { PersonLink } from "../detail/parts";

export function FundPeople({ people }: { people: GroupFundPerson[] }) {
  if (people.length === 0) return null;
  return (
    <ul className="divide-y divide-line">
      {people.map((p) => (
        <li key={p.userId} className="flex items-center gap-3 px-4 py-1.5">
          <PersonLink person={p} />
          <span className="shrink-0 text-small text-ink">
            Debe <span className="font-mono font-medium">{formatCLP(p.pending)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
