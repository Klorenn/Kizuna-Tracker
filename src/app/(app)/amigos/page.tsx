import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SentRequestRow } from "@/components/FriendActions";
import { FriendRequestRow } from "@/components/FriendRequestRow";
import { LoadFailed } from "@/components/LoadFailed";
import { ActivityFeed } from "@/components/friends/ActivityFeed";
import { ShareProfileButton } from "@/components/ShareProfileButton";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { localDate } from "@/domain/dates";
import { loadFeedPage } from "@/lib/activity-feed";
import { avatarUrl } from "@/lib/avatar";
import { SUGGESTION_COUNT, SUGGESTION_POOL, loadPeople } from "@/lib/discover-data";
import type { FeedPage } from "@/lib/feed";
import { friendStatusText } from "@/lib/friend-view";
import { friendStreaks } from "@/lib/friends-data";
import { readRows } from "@/lib/read";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionUser, getViewerProfile } from "@/lib/viewer";
import { PeopleSearch } from "./PeopleSearch";
import { SuggestionsSection } from "./SuggestionsSection";

export const metadata: Metadata = { title: "Amigos" };

const EMPTY_FEED: FeedPage = { items: [], next: null };

/** Avatar + name + @usuario that opens the profile; the 44 px row is the target. */
function PersonLink({
  username,
  name,
  avatar,
  preset,
  hint,
  chevron = false,
}: {
  username: string;
  name: string;
  avatar: string | null;
  preset?: number | null;
  hint?: string;
  chevron?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Avatar name={name} src={avatar} preset={preset} />
      <Link
        href={`/@${username}`}
        className="flex min-h-11 min-w-0 flex-1 items-center rounded-md focus-visible:outline-offset-[-2px]"
      >
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="truncate text-body font-medium text-ink">{name}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-small text-muted">
          <span className="truncate font-mono text-[13px]">@{username}</span>
          {hint ? (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0">{hint}</span>
            </>
          ) : null}
        </span>
      </span>
      {chevron ? <CaretRight size={18} weight="light" aria-hidden className="-mr-1 shrink-0 text-muted" /> : null}
      </Link>
    </div>
  );
}

export default async function AmigosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; amigo?: string }>;
}) {
  const { q = "", amigo } = await searchParams;
  // the inline result card moved to Explorar: an old /amigos?q=x link lands there
  if (typeof q === "string" && q.trim()) redirect(`/amigos/explorar?q=${encodeURIComponent(q)}`);
  const justAdded = amigo && /^[a-z0-9_]{3,20}$/.test(amigo) ? amigo : null;
  const supabase = await createServerClient();
  const user = await getSessionUser();
  if (!user) redirect("/bienvenida");
  // the session check is the only read everything else waits on: profile, friendships, suggestions and the feed
  // start together. The feed needs the timezone just to format times, so it gets the promise.
  const meRead = getViewerProfile();
  // never rejects: nobody may be awaiting it (an empty feed returns before formatting times)
  const timezone = meRead.then((p) => p?.timezone ?? "UTC").catch(() => "UTC");
  const [me, friendshipsRes, suggestions, feed] = await Promise.all([
    meRead,
    supabase
      .from("friendships")
      .select("id,requester_id,addressee_id,status")
      .order("created_at", { ascending: false })
      .limit(1000),
    loadPeople({ query: null, offset: 0, limit: SUGGESTION_POOL }),
    loadFeedPage(supabase, user.id, { timezone }).catch((): null => null),
  ]);
  if (!me) redirect("/login?error=perfil");
  const today = localDate(new Date(), me.timezone);

  const rows = readRows(friendshipsRes);
  const other = (f: { requester_id: string; addressee_id: string }) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id;
  const incoming = rows.filter((f) => f.status === "pending" && f.addressee_id === user.id);
  const sent = rows.filter((f) => f.status === "pending" && f.requester_id === user.id);
  const friends = rows.filter((f) => f.status === "accepted");
  const friendIds = friends.map(other);

  const [streakRead, peopleRes] = await Promise.all([
    // on failure: a retry line instead of status lines (never a false "Sin racha activa")
    friendStreaks(supabase, friendIds, today).catch((): { ok: false } => ({ ok: false })),
    rows.length
      ? supabase.from("public_profiles").select("id,username,display_name,avatar_path,avatar_preset").in("id", rows.map(other))
      : Promise.resolve({ data: [] }),
  ]);
  // pending requests already have their own lists (Solicitudes, Enviadas)
  const suggested = suggestions.ok ? suggestions.people.filter((p) => p.relation === "none").slice(0, SUGGESTION_COUNT) : null;
  const streaks = streakRead.ok ? streakRead.streaks : null;
  const byId = new Map(readRows(peopleRes).map((p) => [p.id, p]));

  const friendRows = friends
    .map((f) => {
      const id = other(f);
      const p = byId.get(id);
      return {
        key: f.id,
        username: p?.username ?? "",
        name: p?.display_name ?? "Usuario",
        avatar: avatarUrl(p?.avatar_path ?? null),
        preset: p?.avatar_preset ?? null,
        status: streaks?.has(id) ? friendStatusText(streaks.get(id)!) : undefined,
      };
    })
    .filter((r) => r.username)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-8">
      <h1 className="text-[44px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">Amigos</h1>

      {justAdded ? (
        <p role="status" className="rounded-md bg-accent-soft px-4 py-3 text-small text-ink">
          Ya son amigos con @{justAdded}.
        </p>
      ) : null}

      <PeopleSearch />

      <SuggestionsSection people={suggested} />

      <ShareProfileButton kind="invite" />

      {incoming.length > 0 || sent.length > 0 ? (
        <section aria-label="Solicitudes" className="flex flex-col gap-2">
          <SectionHeader
            label="Solicitudes"
            action={incoming.length === 0 ? undefined : incoming.length === 1 ? "1 nueva" : `${incoming.length} nuevas`}
          />
          {incoming.length > 0 ? (
            <Card className="divide-y divide-line">
              {incoming.map((f) => {
                const p = byId.get(f.requester_id);
                return (
                  <div key={f.id} className="px-4 py-3">
                    <FriendRequestRow
                      id={f.id}
                      displayName={p?.display_name ?? "Usuario"}
                      username={p?.username ?? ""}
                      avatar={avatarUrl(p?.avatar_path ?? null)}
                      avatarPreset={p?.avatar_preset ?? null}
                    />
                  </div>
                );
              })}
            </Card>
          ) : null}
          {sent.length > 0 ? (
            <>
              <h3 className="section-label pt-2 text-muted">Enviadas</h3>
              <Card>
                <ul className="divide-y divide-line">
                  {sent.flatMap((f) => {
                    const p = byId.get(f.addressee_id);
                    if (!p?.username) return [];
                    return [
                      <li key={f.id}>
                        <SentRequestRow
                          person={{
                            id: f.addressee_id,
                            username: p.username,
                            displayName: p.display_name ?? "Usuario",
                            avatarSrc: avatarUrl(p.avatar_path ?? null),
                            avatarPreset: p.avatar_preset ?? null,
                          }}
                        />
                      </li>,
                    ];
                  })}
                </ul>
              </Card>
            </>
          ) : null}
        </section>
      ) : null}

      {friendRows.length > 0 ? (
        <section aria-label="Tus amigos" className="flex flex-col gap-2">
          <SectionHeader label="Tus amigos" action={String(friendRows.length)} />
          {streaks ? null : <LoadFailed href="/amigos" />}
          <Card>
            <ul className="divide-y divide-line">
              {friendRows.map((r) => (
                <li key={r.key} className="px-4 py-2.5 transition-colors duration-[120ms] hover:bg-field">
                  <PersonLink username={r.username} name={r.name} avatar={r.avatar} preset={r.preset} hint={r.status} chevron />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <section aria-label="Actividad" className="flex flex-col gap-2">
        <SectionHeader label="Actividad" />
        <ActivityFeed
          initial={feed ?? EMPTY_FEED}
          initialError={feed ? null : "No pudimos cargar la actividad."}
          today={today}
          empty={
            friends.length === 0
              ? {
                  title: "Aún no tienes amigos",
                  body: "Invita a alguien con un link o búscalo por su usuario.",
                  action: <ShareProfileButton kind="invite" label="Invitar" />,
                }
              : {
                  title: "Todavía no hay actividad",
                  body: "Cuando tus amigos registren un hábito, lo verás aquí.",
                  action: <ShareProfileButton kind="invite" label="Invitar" />,
                }
          }
        />
      </section>
    </main>
  );
}
