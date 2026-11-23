"use client";

import { Warning } from "@phosphor-icons/react";
import { memo, useState, useTransition, type ReactNode } from "react";
import { loadActivity } from "@/app/(app)/amigos/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import type { FeedCursor, FeedEntry, FeedFilter, FeedPage } from "@/lib/feed";
import { ActivityDays } from "./ActivityItem";

type Stream = { pages: FeedEntry[][]; next: FeedCursor | null; error: string | null };

const FILTERS: { key: FeedFilter; label: string }[] = [
  { key: "all", label: "Todo" },
  { key: "photos", label: "Fotos" },
];

/**
 * One loaded page. Memoized on its own items: "Ver más" appends a page without re-rendering the
 * ones already on screen. A page that starts on the previous page's last day skips its label.
 */
const FeedChunk = memo(function FeedChunk({
  items,
  today,
  continuesFrom,
}: {
  items: FeedEntry[];
  today: string;
  continuesFrom: string | null;
}) {
  return <ActivityDays items={items} today={today} continuesFrom={continuesFrom} />;
});

/** Amigos "Actividad": day groups, filter chips and keyset "Ver más" (20 per page). */
export function ActivityFeed({
  initial,
  initialError = null,
  today,
  empty,
}: {
  initial: FeedPage;
  /** The server could not load the first page: show a retry instead of a false "no activity". */
  initialError?: string | null;
  today: string;
  /** Shown when there is nothing at all (no friends yet, or friends without activity). */
  empty: { title: string; body: string; action?: ReactNode };
}) {
  const fresh = (): Partial<Record<FeedFilter, Stream>> => ({
    all: { pages: [initial.items], next: initial.next, error: initialError },
  });
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [streams, setStreams] = useState<Partial<Record<FeedFilter, Stream>>>(fresh);
  // router.refresh() (accept a request, remove a friend…) hands down a new `initial`: start over
  // from it instead of showing the stale pages (adjust state during render, no effect needed)
  const [seen, setSeen] = useState({ initial, initialError });
  if (seen.initial !== initial || seen.initialError !== initialError) {
    setSeen({ initial, initialError });
    setFilter("all");
    setStreams(fresh());
  }
  const [busy, start] = useTransition();
  const stream = streams[filter];

  function fetchPage(f: FeedFilter, cursor: FeedCursor | null) {
    start(async () => {
      const r = await loadActivity({ filter: f, cursor });
      setStreams((s) => {
        const prev = s[f] ?? { pages: [], next: null, error: null };
        if (!r.ok) return { ...s, [f]: { ...prev, error: r.error } };
        return { ...s, [f]: { pages: [...prev.pages, r.page.items], next: r.page.next, error: null } };
      });
    });
  }

  function pick(f: FeedFilter) {
    setFilter(f);
    if (!streams[f]) fetchPage(f, null);
  }

  const pages = stream?.pages ?? [];
  const nothing = stream !== undefined && pages.every((p) => p.length === 0) && !stream.error;

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Filtrar actividad" className="flex gap-2">
        {FILTERS.map((f) => (
          <Chip key={f.key} selected={filter === f.key} onClick={() => pick(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>

      <div aria-busy={busy} className="flex flex-col gap-2">
        {nothing ? (
          <Card>
            {filter === "photos" ? (
              <EmptyState title="Aún no hay fotos" body="Cuando tus amigos suban una foto de prueba, la verás aquí." />
            ) : (
              <EmptyState title={empty.title} body={empty.body} action={empty.action} />
            )}
          </Card>
        ) : (
          pages.map((items, i) => {
            const prev = pages[i - 1];
            return (
              <FeedChunk
                key={i}
                items={items}
                today={today}
                continuesFrom={prev && prev.length > 0 ? prev[prev.length - 1].localDate : null}
              />
            );
          })
        )}
        {stream === undefined && busy ? <p className="py-4 text-center text-small text-muted">Cargando…</p> : null}
      </div>

      {stream?.error ? (
        <p role="alert" className="flex items-start gap-[6px] text-small text-ink">
          <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
          {stream.error}
        </p>
      ) : null}
      {stream && (stream.next || stream.error) ? (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => fetchPage(filter, stream.next)}
          className="mt-2"
        >
          {busy ? "Cargando…" : stream.error ? "Reintentar" : "Ver más"}
        </Button>
      ) : null}
    </div>
  );
}
