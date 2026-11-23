import { Lock } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { AddFriendButton } from "@/components/FriendActions";
import { FriendProfileView } from "@/components/friends/FriendProfileView";
import { RequestButtons } from "@/components/friends/RequestButtons";
import { HabitIcon } from "@/components/habit-icon";
import { ShareProfileButton } from "@/components/ShareProfileButton";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { localDate } from "@/domain/dates";
import { avatarUrl } from "@/lib/avatar";
import type { IconKey } from "@/domain/presets";
import { loadFriendProfile } from "@/lib/friend-profile-data";
import { viewerState, type ViewerState } from "@/lib/friend-view";
import {
  profileShareUrl,
  toPublicProfileView,
  type PublicProfileRow,
} from "@/lib/public-profile";
import { siteOrigin } from "@/lib/site-url";
import { createServerClient } from "@/lib/supabase/server";

// Hidden from search engines until the legal review is done.
export const metadata: Metadata = { title: "Perfil", robots: { index: false, follow: false } };

/** Signed-in viewers keep the app's bottom navigation (this route lives outside the (app) group). */
function InAppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="pb-[calc(3.5rem+env(safe-area-inset-bottom))]">{children}</div>
      <BottomNav />
    </>
  );
}

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
  const username = raw.toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return <Unavailable />;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Viewer state: anonymous and strangers get the public view; friends the rich one; self → Perfil.
  let timezone = "UTC";
  let state: ViewerState = "anon";
  let friendshipId: string | null = null;
  // name, @handle and avatar from public_profiles: enough to show who is asking even when the
  // public_profile RPC has nothing (no public habits)
  let target: { id: string | null; username: string | null; display_name: string | null; avatar_path: string | null; avatar_preset: number | null } | null = null;
  if (user) {
    const { data: viewer } = await supabase
      .from("profiles")
      .select("id,timezone,username")
      .eq("id", user.id)
      .maybeSingle();
    if (viewer) timezone = viewer.timezone;
    if (viewer?.username === username) redirect("/perfil");
    const { data: found } = await supabase
      .from("public_profiles")
      .select("id,username,display_name,avatar_path,avatar_preset")
      .eq("username", username)
      .maybeSingle();
    target = found;
    if (target?.id) {
      const { data: f } = await supabase
        .from("friendships")
        .select("id,requester_id,addressee_id,status")
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${user.id})`,
        )
        .maybeSingle();
      state = viewerState(user.id, target.id, f);
      friendshipId = f?.id ?? null;
      if (state === "self") redirect("/perfil");
      if (state === "friend") {
        const today = localDate(new Date(), timezone);
        const data = await loadFriendProfile(supabase, user.id, target.id, today, timezone);
        return (
          <InAppShell>
            <FriendProfileView
              friend={{
                id: target.id,
                username: target.username ?? username,
                name: target.display_name ?? "Tu amigo",
                avatar: avatarUrl(target.avatar_path),
                avatarPreset: target.avatar_preset,
              }}
              data={data}
              today={today}
            />
          </InAppShell>
        );
      }
    } else {
      state = "stranger";
    }
  }

  const { data } = await supabase.rpc("public_profile", { p_username: username });
  // someone with a pending request still sees who it is (and Aceptar/Rechazar) even with no public habits
  const asking = (state === "incoming" || state === "outgoing") && target?.username ? target : null;
  if (!data && !asking) return <Unavailable />;
  const row: PublicProfileRow = data
    ? (data as unknown as PublicProfileRow)
    : {
        username: asking!.username!,
        displayName: asking!.display_name ?? asking!.username!,
        avatarPath: asking!.avatar_path,
        avatarPreset: asking!.avatar_preset,
        habits: [],
      };
  const view = toPublicProfileView(row, localDate(new Date(), timezone));
  const shareUrl = profileShareUrl(siteOrigin(await headers()), view.username);

  const page = (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-8 pt-8">
      <header className="flex items-center gap-4">
        <Avatar name={view.displayName} size="L" src={avatarUrl(view.avatarPath, view.avatarUpdatedAt)} preset={view.avatarPreset} priority />
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <h1 className="truncate text-title font-semibold text-ink">{view.displayName}</h1>
          <p className="truncate font-mono text-[14px] text-muted">@{view.username}</p>
        </div>
      </header>

      {state === "incoming" && friendshipId ? (
        <RequestButtons friendshipId={friendshipId} name={view.displayName.split(" ")[0]} />
      ) : null}
      <div className="flex gap-3">
        {state === "incoming" ? null : (
          <div className="flex-1">
            {state === "anon" ? (
              <ButtonLink href={`/login?next=${encodeURIComponent(`/@${view.username}`)}`}>
                Agregar amigo
              </ButtonLink>
            ) : (
              <AddFriendButton username={view.username} initial={state === "outgoing" ? "pending" : "idle"} />
            )}
          </div>
        )}
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
        view.habits.map((hab, habIndex) => {
          const weekly = hab.frequencyType === "weekly";
          const doneCount = hab.weeks.flat().filter((d) => d.done).length;
          return (
            <Card key={`${habIndex}-${hab.name}`} className="flex flex-col gap-3 p-4" data-habit-color={hab.color}>
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-(--habit-soft) text-ink ring-[1.5px] ring-inset ring-(--habit)">
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
              <div role="img" aria-label={`${doneCount} días hechos en las últimas 26 semanas`}>
                <div aria-hidden className="grid grid-flow-col grid-rows-1 gap-[2px]" style={{ gridTemplateColumns: "repeat(26, minmax(0, 1fr))" }}>
                  {hab.monthLabels.map((m, i) => (
                    <span key={i} className="relative h-3 font-mono text-[10px] leading-3 text-muted">
                      {m ? <span className="absolute left-0 whitespace-nowrap">{m}</span> : null}
                    </span>
                  ))}
                </div>
                <div aria-hidden className="mt-1 grid gap-[2px]" style={{ gridTemplateColumns: "repeat(26, minmax(0, 1fr))" }}>
                  {hab.weeks.map((col, i) => (
                    <div key={i} className="grid gap-[2px]">
                      {col.map((d) => (
                        <span
                          key={d.date}
                          className={`aspect-square rounded-[2px] ${
                            d.future ? "bg-transparent" : d.done ? "bg-(--habit)" : "bg-(--habit-soft)"
                          }`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
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
  return user ? <InAppShell>{page}</InAppShell> : page;
}
