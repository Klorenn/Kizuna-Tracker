import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TopBar } from "@/components/ui/TopBar";
import { dayHeading } from "@/domain/calendar";
import { localDate } from "@/domain/dates";
import { logDateParam } from "@/lib/log-date";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionUser, getViewerProfile } from "@/lib/viewer";
import { TiempoEditor } from "./TiempoEditor";

export const metadata: Metadata = { title: "Tiempo" };

/**
 * Add, edit or delete the time of one day (`?fecha=YYYY-MM-DD`; missing, malformed or future ->
 * today in the profile's zone). The time lives on that day's check-in; only today can be added
 * without one (add_time creates it), past days without a check-in have nothing to log.
 */
export default async function TiempoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fecha?: string | string[] }>;
}) {
  const [{ id }, { fecha }] = await Promise.all([params, searchParams]);
  const supabase = await createServerClient();
  const user = await getSessionUser();
  if (!user) redirect("/bienvenida");
  const [profile, { data: habit }] = await Promise.all([
    getViewerProfile(),
    supabase
      .from("habits")
      .select("id,name,preset,log_type")
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("log_type", "time")
      .is("archived_at", null)
      .maybeSingle(),
  ]);
  if (!profile) redirect("/login?error=perfil");
  if (!habit) notFound();

  const today = localDate(new Date(), profile.timezone);
  const date = logDateParam(fecha, today);
  const { data: checkin } = await supabase
    .from("checkins")
    .select("id")
    .eq("habit_id", id)
    .eq("user_id", user.id)
    .eq("local_date", date)
    .maybeSingle();
  const { data: entry } = checkin
    ? await supabase.from("time_entries").select("minutes,topic").eq("checkin_id", checkin.id).maybeSingle()
    : { data: null };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <TopBar backHref={`/habitos/${id}`} />
      <div className="flex flex-col gap-1">
        <h1 className="text-display font-semibold text-ink">Tiempo</h1>
        <p className="text-small text-muted">
          {habit.name} · {dayHeading(date, today)}
        </p>
      </div>
      {!checkin && date !== today ? (
        <Card>
          <EmptyState title="Ese día no tiene check-in" body="Los registros se guardan sobre un día cumplido." />
        </Card>
      ) : (
        <TiempoEditor
          key={date}
          habitId={id}
          preset={habit.preset}
          checkinId={checkin?.id ?? null}
          entry={entry ? { minutes: entry.minutes, topic: entry.topic } : null}
        />
      )}
    </main>
  );
}
