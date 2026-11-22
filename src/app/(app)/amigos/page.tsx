import { TZDate } from "@date-fns/tz";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { format, isSameDay, subDays } from "date-fns";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AddFriendButton, RemoveFriendButton } from "@/components/FriendActions";
import { FeedItem, type FeedEntry } from "@/components/FeedItem";
import { FriendRequestRow } from "@/components/FriendRequestRow";
import { ShareProfileButton } from "@/components/ShareProfileButton";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { createServerClient } from "@/lib/supabase/server";
import { searchUsers } from "./actions";

export const metadata: Metadata = { title: "Amigos" };

const PAGE = 20;
const MAX = 100;
const SIGNED_SECONDS = 300;
const REVIEW_WINDOW_HOURS = 24;

function whenLabel(instant: Date, now: Date, tz: string): string {
  const t = new TZDate(instant, tz);
  const n = new TZDate(now, tz);
  const hm = format(t, "HH:mm");
  if (isSameDay(t, n)) return `Hoy ${hm}`;
  if (isSameDay(t, subDays(n, 1))) return `Ayer ${hm}`;
  return `${format(t, "d MMM")} ${hm}`;
}

export default async function AmigosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; n?: string; amigo?: string }>;
}) {
  const { q = "", n, amigo } = await searchParams;
  const justAdded = amigo && /^[a-z0-9_]{3,20}$/.test(amigo) ? amigo : null;
  const limit = Math.min(MAX, Math.max(PAGE, Number.parseInt(n ?? "", 10) || PAGE));
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");
  const { data: me } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  if (!me) redirect("/login?error=perfil");

  const { data: friendships } = await supabase
    .from("friendships")
    .select("id,requester_id,addressee_id,status")
    .order("created_at", { ascending: false });
  const rows = friendships ?? [];
  const other = (f: { requester_id: string; addressee_id: string }) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id;
  const incoming = rows.filter((f) => f.status === "pending" && f.addressee_id === user.id);
  const friends = rows.filter((f) => f.status === "accepted");
  const related = new Map(rows.map((f) => [other(f), f]));

  const hits = q.trim() ? await searchUsers(q) : [];

  const { data: feedRows } = await supabase
    .from("checkins")
    .select("id,user_id,created_at,photo_path,habits(name,icon)")
    .neq("user_id", user.id)
    .is("rejected_at", null)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  const feed = (feedRows ?? []).slice(0, limit);
  const hasMore = (feedRows ?? []).length > limit;

  const ids = [...new Set([...rows.map(other), ...feed.map((c) => c.user_id)])];
  const { data: people } = ids.length
    ? await supabase.from("public_profiles").select("id,username,display_name").in("id", ids)
    : { data: [] };
  const byId = new Map((people ?? []).map((p) => [p.id, p]));

  const photoPaths = feed.flatMap((c) => (c.photo_path ? [c.photo_path] : []));
  const signed = photoPaths.length
    ? await supabase.storage.from("proofs").createSignedUrls(photoPaths, SIGNED_SECONDS)
    : { data: [] };
  const urlByPath = new Map(
    (signed.data ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])),
  );

  const now = new Date();
  const entries: FeedEntry[] = feed.map((c) => {
    const left = Math.ceil(
      REVIEW_WINDOW_HOURS - (now.getTime() - new Date(c.created_at).getTime()) / 3_600_000,
    );
    const photoUrl = c.photo_path ? (urlByPath.get(c.photo_path) ?? null) : null;
    return {
      id: c.id,
      who: byId.get(c.user_id)?.display_name?.split(" ")[0] ?? "Un amigo",
      habit: c.habits?.name ?? "Hábito",
      icon: c.habits?.icon ?? "target",
      when: whenLabel(new Date(c.created_at), now, me.timezone),
      photoUrl,
      note: photoUrl && left > 0 ? `se aprueba sola en ${left} h` : null,
    };
  });

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
                <div key={h.id} className="flex items-center gap-3 p-4">
                  <Avatar name={h.displayName} />
                  <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <p className="truncate text-body font-medium text-ink">{h.displayName}</p>
                    <p className="truncate text-small text-muted">@{h.username}</p>
                  </div>
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
        <>
          <SectionHeader
            label="Solicitudes"
            action={incoming.length === 1 ? "1 nueva" : `${incoming.length} nuevas`}
          />
          <Card className="divide-y divide-line">
            {incoming.map((f) => {
              const p = byId.get(f.requester_id);
              return (
                <div key={f.id} className="p-4">
                  <FriendRequestRow
                    id={f.id}
                    displayName={p?.display_name ?? "Usuario"}
                    username={p?.username ?? ""}
                  />
                </div>
              );
            })}
          </Card>
        </>
      ) : null}

      {friends.length > 0 ? (
        <>
          <SectionHeader label="Tus amigos" action={String(friends.length)} />
          <Card className="divide-y divide-line">
            {friends.map((f) => {
              const id = other(f);
              const p = byId.get(id);
              const name = p?.display_name ?? "Usuario";
              return (
                <div key={f.id} className="flex items-center gap-3 p-4">
                  <Avatar name={name} />
                  <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <p className="truncate text-body font-medium text-ink">{name}</p>
                    <p className="truncate text-small text-muted">@{p?.username}</p>
                  </div>
                  <RemoveFriendButton userId={id} name={name} />
                </div>
              );
            })}
          </Card>
        </>
      ) : null}

      <SectionHeader label="Actividad" />
      {entries.length === 0 ? (
        <Card>
          <EmptyState
            title={friends.length === 0 ? "Aún no tienes amigos" : "Todavía no hay actividad"}
            body={
              friends.length === 0
                ? "Invita a alguien con un link o búscalo por su usuario."
                : "Cuando tus amigos registren un hábito, lo verás aquí."
            }
          />
        </Card>
      ) : (
        <>
          {entries.map((e) => (
            <FeedItem key={e.id} entry={e} />
          ))}
          {hasMore && limit < MAX ? (
            <ButtonLink variant="secondary" href={`/amigos?${q ? `q=${encodeURIComponent(q)}&` : ""}n=${limit + PAGE}`}>
              Ver más
            </ButtonLink>
          ) : null}
        </>
      )}
    </main>
  );
}
