import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TopBar } from "@/components/ui/TopBar";
import { dayHeading } from "@/domain/calendar";
import { CARDIO_KINDS, type CardioKind } from "@/domain/cardio";
import { localDate } from "@/domain/dates";
import { logDateParam } from "@/lib/log-date";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionUser, getViewerProfile } from "@/lib/viewer";
import { DistanciaEditor } from "./DistanciaEditor";

export const metadata: Metadata = { title: "Distancia" };

/**
 * Add, edit or delete the outings of one day (`?fecha=YYYY-MM-DD`; missing, malformed or future →
 * today in the profile's zone). Outings live on that day's check-in: without one there is nothing
 * to log (past check-ins cannot be created).
 */
export default async function DistanciaPage({
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
    supabase.from("habits").select("id,name,log_type").eq("id", id).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!profile) redirect("/login?error=perfil");
  if (!habit) notFound();

  const today = localDate(new Date(), profile.timezone);
  const date = logDateParam(fecha, today);
  // rejected check-ins keep their logs too: the log is your data
  const [{ data: checkin }, { data: rows }] = await Promise.all([
    supabase
      .from("checkins")
      .select("id")
      .eq("habit_id", id)
      .eq("user_id", user.id)
      .eq("local_date", date)
      .maybeSingle(),
    supabase
      .from("cardio_entries")
      .select("id,kind,distance_m,duration_s,effort,note")
      .eq("habit_id", id)
      .eq("local_date", date)
      .order("created_at", { ascending: true })
      .limit(10),
  ]);
  const entries = (rows ?? []).flatMap((r) =>
    CARDIO_KINDS.includes(r.kind as CardioKind)
      ? [
          {
            id: r.id,
            kind: r.kind as CardioKind,
            distanceM: r.distance_m,
            durationS: r.duration_s,
            effort: r.effort,
            note: r.note,
          },
        ]
      : [],
  );
  const isCardio = habit.log_type === "cardio";
  // the log type changed after logging: the old outings still show, so they can be fixed or deleted
  const leftover = !isCardio && entries.length > 0;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <TopBar backHref={`/habitos/${id}`} />
      <div className="flex flex-col gap-1">
        <h1 className="text-display font-semibold text-ink">Distancia</h1>
        <p className="text-small text-muted">
          {habit.name} · {dayHeading(date, today)}
        </p>
      </div>
      {!isCardio && !leftover ? (
        <Card>
          <EmptyState
            title="Este hábito no lleva distancia"
            body="Elige Distancia en Registro detallado para anotar tus salidas."
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
              Este hábito ya no lleva distancia. Puedes borrar las salidas que quedaron de ese día.
            </p>
          ) : null}
          <DistanciaEditor
            habitId={id}
            checkinId={checkin.id}
            entries={entries}
            defaultKind={entries.at(-1)?.kind ?? "run"}
          />
        </>
      )}
    </main>
  );
}
