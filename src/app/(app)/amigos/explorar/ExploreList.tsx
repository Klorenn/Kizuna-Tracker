"use client";

import { Warning } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { loadMorePeople } from "@/app/(app)/amigos/actions";
import { DiscoverPersonRow } from "@/components/FriendActions";
import { ShareProfileButton } from "@/components/ShareProfileButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Person } from "@/lib/discover-data";
import { safeAction } from "@/lib/safe-action";

/**
 * The first page comes from the server; "Ver más" appends the next one. Rows keep their own state
 * and their keys, so nothing already shown resets or moves when a page is added.
 */
export function ExploreList({
  query,
  initial,
  initialHasMore,
}: {
  query: string | null;
  initial: Person[];
  initialHasMore: boolean;
}) {
  const [people, setPeople] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function more() {
    start(async () => {
      setError(null);
      const call = await safeAction(() => loadMorePeople(query, people.length));
      const r = call.ok ? call.value : call;
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPeople((cur) => {
        const seen = new Set(cur.map((p) => p.id));
        return [...cur, ...r.people.filter((p) => !seen.has(p.id))];
      });
      setHasMore(r.hasMore);
    });
  }

  // empty states live here, not in the page: a server action revalidates the route, and a page that
  // swapped this list for a message would make the row the person just acted on vanish
  if (people.length === 0) {
    return query ? (
      <p role="status" className="text-body text-muted">
        Nadie coincide con esa búsqueda.
      </p>
    ) : (
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-body text-muted">Todavía no hay más personas por aquí. Invita a alguien con tu enlace.</p>
        <ShareProfileButton kind="invite" label="Invitar" />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <ul className="divide-y divide-line">
          {people.map((p) => (
            <li key={p.id}>
              <DiscoverPersonRow person={p} />
            </li>
          ))}
        </ul>
      </Card>
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-small text-ink">
          <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}
      {hasMore ? (
        <Button variant="secondary" disabled={busy} onClick={more}>
          {busy ? "Cargando…" : "Ver más"}
        </Button>
      ) : null}
    </div>
  );
}
