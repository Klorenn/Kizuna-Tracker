import { TZDate } from "@date-fns/tz";
import { Camera, Plus } from "@phosphor-icons/react/dist/ssr";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { redirect } from "next/navigation";
import { HabitRow } from "@/components/HabitRow";
import { InstallPrompt } from "@/components/InstallPrompt";
import { NotificationBell } from "@/components/NotificationBell";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { addDays, localDate } from "@/domain/dates";
import { buildToday } from "@/domain/today";
import { fetchAll } from "@/lib/paginate";
import { createServerClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/login?error=perfil");

  const now = new Date();
  const today = localDate(now, profile.timezone);

  const [habits, items, checkins, itemChecks] = await Promise.all([
    supabase
      .from("habits")
      .select("id,name,icon,visibility,requires_photo,frequency_type,target_per_week")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("created_at"),
    supabase
      .from("habit_items")
      .select("id,habit_id,label,position,requires_photo")
      .eq("user_id", user.id)
      .is("archived_at", null),
    // 400 days of every habit passes the 1000-row cap within months: read it page by page
    fetchAll((from, to) =>
      supabase
        .from("checkins")
        .select("habit_id,local_date")
        .eq("user_id", user.id)
        .is("rejected_at", null)
        .gte("local_date", addDays(today, -400))
        .order("local_date")
        .order("habit_id")
        .range(from, to),
    ),
    supabase
      .from("checkin_items")
      .select("item_id,local_date,created_at")
      .eq("user_id", user.id)
      .eq("local_date", today),
  ]);

  const view = buildToday({
    habits: habits.data ?? [],
    items: items.data ?? [],
    checkins,
    itemChecks: itemChecks.data ?? [],
    today,
    timeZone: profile.timezone,
  });
  const label = `Hoy · ${format(new TZDate(now, profile.timezone), "EEE d MMM", { locale: es })}`;
  const pct = view.total === 0 ? 0 : (view.doneCount / view.total) * 100;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-8">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-[44px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">Hoy</h1>
        <NotificationBell />
      </div>
      <InstallPrompt />
      <SectionHeader label={label} action="Ver metas" href="/metas" />
      {view.total === 0 ? (
        <>
          <Card>
            <EmptyState
              title="Todavía no tienes hábitos"
              body="Crea el primero. Puede ser algo pequeño, como tomar agua."
              action={
                <ButtonLink href="/habitos/nuevo" className="w-auto!">
                  <Plus size={20} weight="light" aria-hidden />
                  Crear hábito
                </ButtonLink>
              }
            />
          </Card>
          <p className="flex items-center gap-3 text-small text-muted">
            <Camera size={20} weight="light" className="shrink-0" aria-hidden />
            Los hábitos de gimnasio piden una foto en vivo como prueba.
          </p>
        </>
      ) : (
        <>
          <Card accent className="p-4 pl-[19px]">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
                  Tus hábitos de hoy
                </p>
                <p className="flex flex-wrap items-center gap-1 text-small text-muted">
                  {view.doneCount} de {view.total} hechos
                  {view.bestDailyStreak > 0 ? (
                    <>
                      · racha de
                      <span className="font-mono text-body font-medium text-ink">
                        {view.bestDailyStreak}
                      </span>
                      {view.bestDailyStreak === 1 ? "día" : "días"}
                    </>
                  ) : null}
                </p>
              </div>
              <ProgressRing value={pct} />
            </div>
            <div className="mt-1 divide-y divide-line">
              {view.rows.map((row) => (
                <HabitRow key={row.id} row={row} />
              ))}
            </div>
          </Card>
          <ButtonLink href="/habitos/nuevo" variant="secondary">
            <Plus size={20} weight="light" aria-hidden />
            Nuevo hábito
          </ButtonLink>
        </>
      )}
    </main>
  );
}
