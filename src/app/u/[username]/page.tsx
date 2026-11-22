import { Lock } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { AddFriendButton } from "@/components/FriendActions";
import { HabitIcon } from "@/components/habit-icon";
import { ShareProfileButton } from "@/components/ShareProfileButton";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { localDate } from "@/domain/dates";
import type { IconKey } from "@/domain/presets";
import {
  profileShareUrl,
  toPublicProfileView,
  type PublicProfileRow,
} from "@/lib/public-profile";
import { createServerClient } from "@/lib/supabase/server";

// Hidden from search engines until the legal review is done.
export const metadata: Metadata = { title: "Perfil", robots: { index: false, follow: false } };

function Unavailable() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-8">
      <Card>
        <EmptyState
          title="Perfil no disponible"
          body="Este perfil no existe o no tiene hábitos públicos."
          action={
            <ButtonLink href="/" className="w-auto!">
              Ir a Kizuna
            </ButtonLink>
          }
        />
      </Card>
    </main>
  );
}

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username: raw } = await params;
  const username = decodeURIComponent(raw).toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return <Unavailable />;

  const supabase = await createServerClient();
  const { data } = await supabase.rpc("public_profile", { p_username: username });
  if (!data) return <Unavailable />;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  let timezone = "UTC";
  let initial: "idle" | "pending" | "accepted" = "idle";
  let isMe = false;
  if (user) {
    const { data: viewer } = await supabase
      .from("profiles")
      .select("id,timezone,username")
      .eq("id", user.id)
      .maybeSingle();
    if (viewer) timezone = viewer.timezone;
    isMe = viewer?.username === username;
    if (!isMe) {
      const { data: target } = await supabase
        .from("public_profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (target?.id) {
        const { data: f } = await supabase
          .from("friendships")
          .select("status")
          .or(
            `and(requester_id.eq.${user.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${user.id})`,
          )
          .maybeSingle();
        if (f) initial = f.status === "accepted" ? "accepted" : "pending";
      }
    }
  }

  const view = toPublicProfileView(data as unknown as PublicProfileRow, localDate(new Date(), timezone));
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const shareUrl = profileShareUrl(`${proto}://${host}`, view.username);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-8 pt-8">
      <header className="flex items-center gap-4">
        <Avatar name={view.displayName} size="L" />
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <h1 className="truncate text-title font-semibold text-ink">{view.displayName}</h1>
          <p className="truncate text-small text-muted">@{view.username}</p>
        </div>
      </header>

      <div className="flex gap-3">
        <div className="flex-1">
          {isMe ? null : user ? (
            <AddFriendButton username={view.username} initial={initial} />
          ) : (
            <ButtonLink href={`/login?next=${encodeURIComponent(`/@${view.username}`)}`}>
              Agregar amigo
            </ButtonLink>
          )}
        </div>
        <div className="flex-1">
          <ShareProfileButton kind="profile" url={shareUrl} label="Copiar link" icon="link" />
        </div>
      </div>

      <SectionHeader label="Hábitos públicos" action={String(view.habits.length)} />
      {view.habits.length === 0 ? (
        <Card>
          <EmptyState title="Sin hábitos públicos" body="Todavía no comparte ningún hábito." />
        </Card>
      ) : (
        view.habits.map((hab) => {
          const weekly = hab.frequencyType === "weekly";
          const doneCount = hab.calendar.filter((d) => d.done).length;
          return (
            <Card key={hab.name} className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-field text-ink">
                  <HabitIcon name={hab.icon as IconKey} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <p className="truncate text-body font-medium text-ink">{hab.name}</p>
                  <p className="text-small text-muted">
                    {weekly ? `${hab.targetPerWeek ?? 1} por semana` : "Todos los días"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <p className="text-title font-semibold text-ink">{hab.streak}</p>
                  <p className="text-small text-muted">
                    {weekly ? (hab.streak === 1 ? "semana" : "semanas") : hab.streak === 1 ? "día" : "días"}
                  </p>
                </div>
              </div>
              <div
                role="img"
                aria-label={`${doneCount} de ${hab.calendar.length} días hechos`}
                className="flex flex-wrap gap-1"
              >
                {hab.calendar.map((d) => (
                  <span
                    key={d.date}
                    className={`size-[9px] rounded-[2px] ${d.done ? "bg-accent" : "bg-ink-soft"}`}
                  />
                ))}
              </div>
            </Card>
          );
        })
      )}

      <p className="flex items-center gap-2 text-small text-muted">
        <Lock size={16} weight="light" className="shrink-0" aria-hidden />
        Las fotos de prueba nunca son públicas. Solo las ven sus amigos.
      </p>
      {user ? null : (
        <Link href="/bienvenida" className="text-small text-accent">
          Conoce Kizuna
        </Link>
      )}
    </main>
  );
}
