"use client";

/**
 * WallFeed: the check-ins of the group's linked habits, newest first, grouped by day.
 *
 * Props: `groupId`, `wall` (GroupWallPage | null: null = the read failed), `today` (optional local
 * date "YYYY-MM-DD" for the "Hoy"/"Ayer" labels; without it the device's date is used after mount),
 * `actions` (`Pick<GroupActions, "loadMoreWall">`), `retryHref`, `color` (group colour key).
 * States: failed, empty, pages with "Ver más" (appended through `actions.loadMoreWall`, de-duplicated
 * by `checkinId`, with its own pending and error states). Photos are private: their signed URLs
 * come from `useSignedUrls` and the images load lazily.
 * Of each member it shows name, @usuario, avatar, the check-in's date (the day group) and the photo.
 */
import { ImageBroken } from "@phosphor-icons/react";
import { memo, useEffect, useRef, useState } from "react";
import { LoadFailed } from "@/components/LoadFailed";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { localDate } from "@/domain/dates";
import { toHabitColor } from "@/domain/habit-colors";
import { groupByDay } from "@/lib/feed";
import type { GroupActions, GroupResult, GroupWallCursor, GroupWallItem, GroupWallPage } from "@/lib/groups-contract";
import { CONNECTION_ERROR, safeAction } from "@/lib/safe-action";
import { useSignedUrls } from "@/lib/use-signed-urls";
import { appendWallPage, initialWall, type WallState } from "./group-logic";
import { ErrorLine, PersonLink } from "./parts";

/** One "Ver más": the next page appended to what is on screen, or the same state carrying the error. */
export async function fetchMoreWall(
  state: WallState,
  groupId: string,
  loadMore: (groupId: string, cursor: GroupWallCursor) => Promise<GroupResult<GroupWallPage>>,
): Promise<WallState> {
  if (!state.next) return state;
  const cursor = state.next;
  const r = await safeAction(() => loadMore(groupId, cursor));
  if (!r.ok) return { ...state, error: r.error || CONNECTION_ERROR };
  return r.value.ok ? appendWallPage(state, r.value.data) : { ...state, error: r.value.error };
}

/** The photo of a check-in: a fixed frame (no layout shift) on the dark media surface. */
function Photo({ url, name }: { url: string | null | undefined; name: string }) {
  return (
    <div
      aria-busy={url === undefined}
      className="relative flex aspect-4/3 w-full items-center justify-center overflow-hidden rounded-md bg-media"
    >
      {url ? (
        // lazy + async decode: a page of full-size photos must not compete with the rest of the screen
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
        <img
          src={url}
          alt={`Foto de ${name}`}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      ) : url === null ? (
        <span className="flex items-center gap-1.5 text-small text-on-media/80">
          <ImageBroken size={18} weight="light" aria-hidden />
          Foto no disponible
        </span>
      ) : (
        <span className="sr-only">Cargando foto</span>
      )}
    </div>
  );
}

function WallEntry({ item, url }: { item: GroupWallItem; url: string | null | undefined }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <PersonLink person={item} />
        <span className="shrink-0 text-small text-muted">{item.photoPath ? "Subió su foto" : "Registró"}</span>
      </div>
      {item.photoPath ? <Photo url={url} name={item.displayName} /> : null}
    </li>
  );
}

/**
 * One loaded page, memoized on its own items: "Ver más" appends a page without re-rendering the
 * ones already on screen. A page that starts on the previous page's last day skips its label.
 */
export const WallChunk = memo(function WallChunk({
  items,
  today,
  continuesFrom,
}: {
  items: GroupWallItem[];
  today: string;
  continuesFrom: string | null;
}) {
  const urls = useSignedUrls(items.flatMap((i) => (i.photoPath ? [i.photoPath] : [])));
  return groupByDay(items, today, continuesFrom).map((g) => (
    <section key={`${g.date}-${g.items[0].checkinId}`} aria-label={g.label} className="flex flex-col gap-2">
      {g.continued ? null : <h3 className="section-label flex h-6 items-center pt-1 text-muted">{g.label}</h3>}
      <Card>
        <ul className="divide-y divide-line">
          {g.items.map((i) => (
            <WallEntry key={i.checkinId} item={i} url={i.photoPath ? urls[i.photoPath] : undefined} />
          ))}
        </ul>
      </Card>
    </section>
  ));
});

/** The viewer's date for the day labels: the page's own `today` when given, else the device's after mount. */
function useToday(provided: string | undefined, firstDate: string | undefined): string {
  const [device, setDevice] = useState<string | null>(null);
  useEffect(() => {
    if (!provided) setDevice(localDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone));
  }, [provided]);
  // before mount nothing is "Hoy": a date that cannot match keeps server and first client render equal
  return provided ?? device ?? `${(firstDate ?? "2000").slice(0, 4)}-12-31`;
}

export function WallFeed({
  groupId,
  wall,
  today,
  actions,
  retryHref,
  color,
}: {
  groupId: string;
  wall: GroupWallPage | null;
  today?: string;
  actions: Pick<GroupActions, "loadMoreWall">;
  retryHref: string;
  color: string;
}) {
  const [state, setState] = useState<WallState | null>(() => (wall ? initialWall(wall) : null));
  // a refresh hands down a new page: start over from it (adjust state during render)
  const [seen, setSeen] = useState(wall);
  if (seen !== wall) {
    setSeen(wall);
    setState(wall ? initialWall(wall) : null);
  }
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const day = useToday(today, state?.pages[0]?.[0]?.localDate);

  if (!wall || !state) return <LoadFailed href={retryHref} />;

  async function more(current: WallState) {
    if (inFlight.current) return; // a second tap before the re-render cannot ask twice
    inFlight.current = true;
    setBusy(true);
    try {
      setState(await fetchMoreWall(current, groupId, actions.loadMoreWall));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const empty = state.pages.length === 0;
  return (
    <div data-habit-color={toHabitColor(color)} aria-busy={busy} className="flex flex-col gap-2">
      {empty ? (
        <Card>
          <EmptyState title="Aún no hay registros en este grupo." body="Cuando alguien registre, lo verás aquí." />
        </Card>
      ) : (
        state.pages.map((items, i) => {
          const prev = state.pages[i - 1];
          return (
            <WallChunk
              key={items[0].checkinId}
              items={items}
              today={day}
              continuesFrom={prev ? prev[prev.length - 1].localDate : null}
            />
          );
        })
      )}
      {state.error ? <ErrorLine>{state.error}</ErrorLine> : null}
      {state.next || state.error ? (
        <Button variant="secondary" disabled={busy || !state.next} onClick={() => more(state)} className="mt-2">
          {busy ? "Cargando…" : state.error ? "Reintentar" : "Ver más"}
        </Button>
      ) : null}
    </div>
  );
}
