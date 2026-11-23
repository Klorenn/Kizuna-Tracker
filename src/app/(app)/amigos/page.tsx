import { CaretRight, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AddFriendButton } from "@/components/FriendActions";
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
import type { FeedPage } from "@/lib/feed";
import { friendStatusText } from "@/lib/friend-view";
import { friendStreaks } from "@/lib/friends-data";
import { createServerClient } from "@/lib/supabase/server";
import { searchUsers } from "./actions";

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
    <Link
      href={`/@${username}`}
      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-offset-[-2px]"
    >
      <Avatar name={name} src={avatar} preset={preset} />
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
  );
}

export default async function AmigosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; amigo?: string }>;
}) {
  const { q = "", amigo } = await searchParams;
  const justAdded = amigo && /^[a-z0-9_]{3,20}$/.test(amigo) ? amigo : null;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");
  // getUser is the only read everything else waits on: profile, friendships, search and the feed
  // start together. The feed needs the timezone just to format times, so it gets the promise.
  const meRead = Promise.resolve(supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle());
  // never rejects: nobody may be awaiting it (an empty feed returns before formatting times)
  const timezone = meRead.then(({ data }) => data?.timezone ?? "UTC").catch(() => "UTC");
  const [{ data: me }, { data: friendships }, hits, feed] = await Promise.all([
    meRead,
    supabase
      .from("friendships")
      .select("id,requester_id,addressee_id,status")
      .order("created_at", { ascending: false })
      .limit(1000),
    q.trim() ? searchUsers(q) : Promise.resolve([]),
    loadFeedPage(supabase, user.id, { timezone }).catch((): null => null),
  ]);
  if (!me) redirect("/login?error=perfil");
  const today = localDate(new Date(), me.timezone);

  const rows = friendships ?? [];
  const other = (f: { requester_id: string; addressee_id: string }) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id;
  const incoming = rows.filter((f) => f.status === "pending" && f.addressee_id === user.id);
  const friends = rows.filter((f) => f.status === "accepted");
  const related = new Map(rows.map((f) => [other(f), f]));
  const friendIds = friends.map(other);

  const [streakRead, { data: people }] = await Promise.all([
    // on failure: a retry line instead of status lines (never a false "Sin racha activa")
    friendStreaks(supabase, friendIds, today).catch((): { ok: false } => ({ ok: false })),
    rows.length
      ? supabase.from("public_profiles").select("id,username,display_name,avatar_path,avatar_preset").in("id", rows.map(other))
      : Promise.resolve({ data: [] }),
  ]);
  const streaks = streakRead.ok ? streakRead.streaks : null;
  const byId = new Map((people ?? []).map((p) => [p.id, p]));

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

      <form action="/amigos" role="search" className="flex">
        <label className="flex h-12 w-full items-center gap-3 rounded-lg bg-field px-4 focus-within:shadow-[inset_0_0_0_2px_var(--color-accent)]">
          <MagnifyingGlass size={20} weight="light" className="shrink-0 text-muted" aria-hidden />
          <span className="sr-only">Buscar por @usuario</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por @usuario"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={21}
            className="min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-muted"
          />
        </label>
      </form>

      {q.trim() ? (
        <Card className="divide-y divide-line">
          {hits.length === 0 ? (
            <p className="p-4 text-body text-muted">No encontramos a nadie con ese usuario.</p>
          ) : (
            hits.map((h) => {
              const f = related.get(h.id);
              const isIncoming = f?.status === "pending" && f.addressee_id === user.id;
              return (
                <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                  <PersonLink username={h.username} name={h.displayName} avatar={avatarUrl(h.avatarPath)} preset={h.avatarPreset} />
                  <AddFriendButton
                    username={h.username}
                    compact
                    incoming={isIncoming}
                    initial={
                      f?.status === "accepted" ? "accepted" : f && !isIncoming ? "pending" : "idle"
                    }
                  />
                </div>
              );
            })
          )}
        </Card>
      ) : null}

      <ShareProfileButton kind="invite" />

      {incoming.length > 0 ? (
        <section aria-label="Solicitudes" className="flex flex-col gap-2">
          <SectionHeader
            label="Solicitudes"
            action={incoming.length === 1 ? "1 nueva" : `${incoming.length} nuevas`}
          />
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
