import { TZDate } from "@date-fns/tz";
import { Camera, Plus } from "@phosphor-icons/react/dist/ssr";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { redirect } from "next/navigation";
import { CatAnimation } from "@/components/brand/CatAnimation";
import { CatPreload } from "@/components/brand/CatPreload";
import { DayCompleteWatcher } from "@/components/DayCompleteSheet";
import { HabitRow, type RowReading } from "@/components/HabitRow";
import { InstallPrompt } from "@/components/InstallPrompt";
import { LoadFailed } from "@/components/LoadFailed";
import { PomodoroBannerLazy } from "@/components/PomodoroBannerLazy";
import { NotificationBell } from "@/components/NotificationBell";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { buildToday } from "@/domain/today";
import { hoyCatAssets } from "@/lib/motion/cat-animation";
import { createServerClient } from "@/lib/supabase/server";
import { loadTodayData } from "@/lib/today-data";
import { getSessionUser, getViewerProfile } from "@/lib/viewer";

export default async function Home() {
  const supabase = await createServerClient();
  const user = await getSessionUser();
  if (!user) redirect("/bienvenida");
  const now = new Date();
  // the profile read starts with the habits: no serial level for it
  const data = await loadTodayData(supabase, user.id, getViewerProfile(), now);
  if (!data.ok && data.missingProfile) redirect("/login?error=perfil");
  if (!data.ok) {
    // any failed read: a retry line, never rows built from partial data (zeros, an empty list, "add" on an existing log)
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-8">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-[44px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">Hoy</h1>
          <NotificationBell />
        </div>
        <LoadFailed href="/" />
      </main>
    );
  }

  const { today, timeZone, habits, items, itemChecks, todayCheckins, todayLogs, checkins, books, groupChips } = data;
  const view = buildToday({
    habits,
    items,
    checkins,
    itemChecks,
    logs: todayLogs.logs,
    quantity: todayLogs.quantity,
    today,
    timeZone: timeZone,
  });
  const checkinByHabit = new Map(todayCheckins.map((c) => [c.habit_id, c.id]));
  const readingFor = (habitId: string): RowReading => ({
    books,
    checkinId: checkinByHabit.get(habitId) ?? null,
    entry: todayLogs.readings[habitId]?.entry ?? null,
  });
  const allDone = view.total > 0 && view.doneCount === view.total;
  const label = `Hoy · ${format(new TZDate(now, timeZone), "EEE d MMM", { locale: es })}`;
  const pct = view.total === 0 ? 0 : (view.doneCount / view.total) * 100;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-8">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-[44px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">Hoy</h1>
        <NotificationBell />
      </div>
      <InstallPrompt />
      <PomodoroBannerLazy
        userId={user.id}
        timeZone={timeZone}
        habits={view.rows.filter((r) => r.logType === "time").map((r) => ({ id: r.id, name: r.name }))}
      />
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
                {/* fixed minimum height: the streak figure (body-size mono) must not make this line taller once a streak starts */}
                <p className="flex min-h-6 flex-wrap items-center gap-1 text-small text-muted">
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
                <HabitRow
                  key={row.id}
                  row={row}
                  today={today}
                  timeZone={timeZone}
                  checkinId={checkinByHabit.get(row.id) ?? null}
                  group={groupChips.get(row.id)}
                  reading={row.logType === "reading" ? readingFor(row.id) : undefined}
                />
              ))}
            </div>
          </Card>
          {allDone ? (
            <div className="flex items-center justify-center gap-3 py-2">
              <CatAnimation asset="sleep" width={56} />
              <p className="text-body text-muted">Listo por hoy. Descansa.</p>
            </div>
          ) : null}
          <ButtonLink href="/habitos/nuevo" variant="secondary">
            <Plus size={20} weight="light" aria-hidden />
            Nuevo hábito
          </ButtonLink>
          <DayCompleteWatcher
            today={today}
            done={view.doneCount}
            total={view.total}
            rows={view.rows.map((r) => ({
              id: r.id,
              preset: r.preset,
              hasItems: r.items.length > 0,
              done: r.done,
              icon: r.icon,
            }))}
          />
          <CatPreload
            assets={hoyCatAssets(
              view.rows.map((r) => ({ preset: r.preset, hasItems: r.items.length > 0, logType: r.logType, icon: r.icon })),
            )}
          />
        </>
      )}
    </main>
  );
}
