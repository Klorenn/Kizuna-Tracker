import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { loadPickerMedia } from "@/app/(app)/series/media-data";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TopBar } from "@/components/ui/TopBar";
import { dayHeading } from "@/domain/calendar";
import { localDate } from "@/domain/dates";
import { logDateParam } from "@/lib/log-date";
import { createServerClient } from "@/lib/supabase/server";
import { VistoEditor } from "./VistoEditor";

export const metadata: Metadata = { title: "Series y películas" };

/**
 * Add, edit or delete what you watched on one day (`?fecha=YYYY-MM-DD`; missing, malformed or future
 * → today in the profile's zone). The entry lives on that day's check-in: without one there is
 * nothing to log (past check-ins cannot be created).
 */
export default async function VistoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fecha?: string | string[] }>;
}) {
  const [{ id }, { fecha }] = await Promise.all([params, searchParams]);
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");
  const [{ data: profile }, { data: habit }] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle(),
    supabase.from("habits").select("id,name,log_type").eq("id", id).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!profile) redirect("/login?error=perfil");
  if (!habit) notFound();

  const today = localDate(new Date(), profile.timezone);
  const date = logDateParam(fecha, today);
  // rejected check-ins keep their logs too: the log is your data
  const { data: checkin } = await supabase
    .from("checkins")
    .select("id")
    .eq("habit_id", id)
    .eq("user_id", user.id)
    .eq("local_date", date)
    .maybeSingle();
  const { data: entry } = checkin
    ? await supabase
        .from("watch_entries")
        .select("media_id,episodes,season,episode_to,minutes,completed")
        .eq("checkin_id", checkin.id)
        .maybeSingle()
    : { data: null };
  const isWatch = habit.log_type === "watch";
  // the log type changed after logging: the old entry still shows, so it can be fixed or deleted
  const leftover = !isWatch && entry !== null;
  const media = checkin && (isWatch || leftover) ? await loadPickerMedia(supabase, user.id, entry?.media_id) : [];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <TopBar backHref={`/habitos/${id}`} />
      <div className="flex flex-col gap-1">
        <h1 className="text-display font-semibold text-ink">Series y películas</h1>
        <p className="text-small text-muted">
          {habit.name} · {dayHeading(date, today)}
        </p>
      </div>
      {!isWatch && !leftover ? (
        <Card>
          <EmptyState
            title="Este hábito no lleva series ni películas"
            body="Elige Series y películas en Registro detallado para anotar lo que ves."
            action={
              <ButtonLink href={`/habitos/${id}/editar`} variant="secondary" className="w-auto!">
                Editar hábito
              </ButtonLink>
            }
          />
        </Card>
      ) : !checkin ? (
        <Card>
          <EmptyState title="Ese día no tiene check-in" body="Los registros se guardan sobre un día cumplido." />
        </Card>
      ) : (
        <>
          {leftover ? (
            <p className="text-small text-pretty text-muted">
              Este hábito ya no lleva series ni películas. Puedes borrar el registro que quedó de ese día.
            </p>
          ) : null}
          <VistoEditor
            formKey={`${checkin.id}:${entry ? `${entry.media_id}:${entry.episodes}:${entry.season}:${entry.episode_to}:${entry.minutes}:${entry.completed}` : "none"}`}
            checkinId={checkin.id}
            media={media}
            entry={
              entry
                ? {
                    mediaId: entry.media_id,
                    episodes: entry.episodes,
                    season: entry.season,
                    episodeTo: entry.episode_to,
                    minutes: entry.minutes,
                    completed: entry.completed,
                  }
                : null
            }
          />
          <ButtonLink href="/series" variant="ghost">
            Ver mis títulos
          </ButtonLink>
        </>
      )}
    </main>
  );
}
