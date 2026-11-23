"use client";

import { useState } from "react";
import { DiscoverPersonRow } from "@/components/FriendActions";
import { LoadFailed } from "@/components/LoadFailed";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { Person } from "@/lib/discover-data";

/**
 * Amigos > Sugerencias. The people shown are fixed on first render: when a row's action refreshes
 * the page (Enviadas changes), the server no longer lists that person, but the row stays where it
 * is, showing its new state, until the person leaves the page. `people` is null when the read failed.
 */
export function SuggestionsSection({ people }: { people: Person[] | null }) {
  const [shown] = useState(people);
  if (shown && shown.length === 0) return null;
  return (
    <section aria-label="Sugerencias" className="flex flex-col gap-2">
      <SectionHeader label="Sugerencias" action="Ver todos" href="/amigos/explorar" />
      {shown ? (
        <Card>
          <ul className="divide-y divide-line">
            {shown.map((p) => (
              <li key={p.id}>
                <DiscoverPersonRow person={p} />
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <LoadFailed href="/amigos" />
      )}
    </section>
  );
}
