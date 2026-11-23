import { CaretLeft, PencilSimple, Trophy } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { MonthOverviewGrid } from "@/components/calendar/MonthOverviewGrid";
import { WeeklyBars } from "@/components/charts/WeeklyBars";
import { GoalCard } from "@/components/GoalCard";
import { ReadingProgress } from "@/components/logs/ReadingProgress";
import { WorkoutProgress } from "@/components/logs/WorkoutProgress";
import { HabitSettings } from "@/components/HabitSettings";
import { HabitIcon, VISIBILITY_LABEL, VisibilityIcon } from "@/components/habit-icon";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  earliestMonth,
  monthNav,
  monthOf,
  parseMonthParam,
  recentMonths,
  withSearch,
  type MonthKey,
} from "@/domain/calendar";
import { addDays, localDate } from "@/domain/dates";
import { toHabitColor } from "@/domain/habit-colors";
import type { LogType } from "@/domain/logs";
import type { IconKey, Visibility } from "@/domain/presets";
import { bestStreak, dailyStreak, weeklyStreak } from "@/domain/streaks";
import type { Frequency } from "@/domain/types";
import { loadFirstCheckinDate, loadMonthDays } from "@/lib/calendar-data";
import { monthOverview } from "@/lib/calendar-days";
import { loadGoals } from "@/lib/goals-data";
import { loadReadingData, loadVisitDates, loadWorkoutData, logWindowStart } from "@/lib/logs-data";
import { streakWindow, weeklyCounts } from "@/lib/stats";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Hábito" };

/** `?vista=meses`: the month-by-month view (same as Resumen), up to a year back. */
const MONTHS_VIEW = "meses";
const OVERVIEW_MONTHS = 12;
const HISTORY_DAYS = 366;

export default async function HabitoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string | string[]; vista?: string }>;
}) {
  const { id } = await params;
  const { mes, vista } = await searchParams;
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

  const { data: habit } = await supabase
    .from("habits")
    .select("id,name,icon,color,visibility,requires_photo,frequency_type,target_per_week,archived_at,created_at,log_type")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .maybeSingle();
  if (!habit) notFound();

  const color = toHabitColor(habit.color);
  const logType: LogType = habit.log_type === "reading" || habit.log_type === "workout" ? habit.log_type : "none";
  const today = localDate(new Date(), profile.timezone);
  // bounded by date and rows (the API caps a query at 1000 rows)
  const { from, limit } = streakWindow(today);
  const { data: checkins } = await supabase
    .from("checkins")
    .select("local_date")
    .eq("habit_id", id)
    .is("rejected_at", null)
    .gte("local_date", from)
    .order("local_date", { ascending: false })
    .limit(limit);
  const dates = (checkins ?? []).map((c) => c.local_date);
  const frequency: Frequency =
    habit.frequency_type === "weekly"
      ? { type: "weekly", target: habit.target_per_week ?? 1 }
      : { type: "daily" };
  const current =
    frequency.type === "daily"
      ? dailyStreak(dates, today)
      : weeklyStreak(dates, frequency.target, today);
  const best = bestStreak(dates, frequency);
  const unit = (n: number) =>
    frequency.type === "daily" ? (n === 1 ? "día" : "días") : n === 1 ? "semana" : "semanas";

  const target = frequency.type === "weekly" ? frequency.target : 7;
  const goals = await loadGoals(supabase, user.id, today, id);

  // Month in the URL (?mes=YYYY-MM), between the first record of this habit and this month.
  const thisMonth = monthOf(today);
  const firstCheckin = await loadFirstCheckinDate(supabase, user.id, [habit.id]);
  const earliest = earliestMonth([firstCheckin, localDate(new Date(habit.created_at), profile.timezone)], thisMonth);
  const month = parseMonthParam(mes, { current: thisMonth, earliest });
  const nav = monthNav(month, { current: thisMonth, earliest });
  const monthsView = vista === MONTHS_VIEW;
  const monthHref = (m: MonthKey, view?: string) =>
    withSearch(`/habitos/${habit.id}`, { mes: m === thisMonth ? undefined : m, vista: view });
  const weeklyNote = frequency.type === "weekly" ? `Meta: ${frequency.target} por semana.` : undefined;

  let calendar: ReactNode;
  if (monthsView) {
    const { data: year } = await supabase
      .from("checkins")
      .select("local_date")
      .eq("habit_id", id)
      .is("rejected_at", null)
      .gte("local_date", addDays(today, -HISTORY_DAYS));
    const doneByDay: Record<string, number> = {};
    for (const c of year ?? []) doneByDay[c.local_date] = 1;
    const since = localDate(new Date(habit.created_at), profile.timezone);
    const months = recentMonths(thisMonth, earliest, OVERVIEW_MONTHS);
    calendar = (
      <>
        <SectionHeader
          label={months.length === 1 ? "Este mes" : `Últimos ${months.length} meses`}
          action="Ver calendario"
          href={monthHref(month)}
          scroll={false}
        />
        <MonthOverviewGrid
          mode="single"
          color={color}
          items={months.map((m) => ({
            overview: monthOverview(m, doneByDay, [{ since }], today),
            href: monthHref(m),
            selected: m === month,
          }))}
        />
      </>
    );
  } else {
    const days = await loadMonthDays(supabase, {
      userId: user.id,
      habits: [habit],
      month,
      today,
      timezone: profile.timezone,
    });
    calendar = (
      <>
        <SectionHeader label="Calendario" action="Ver por meses" href={monthHref(month, MONTHS_VIEW)} scroll={false} />
        {/* thin side padding: seven >= 44 px day cells fit from 360 px wide */}
        <Card className="px-1 py-4">
          <MonthCalendar
            month={month}
            today={today}
            habits={[{ id: habit.id, name: habit.name, color, icon: habit.icon, logType }]}
            days={days}
            mode="single"
            prevHref={nav.prev ? monthHref(nav.prev) : null}
            nextHref={nav.next ? monthHref(nav.next) : null}
            todayHref={nav.isCurrent ? null : monthHref(thisMonth)}
            note={weeklyNote}
          />
        </Card>
      </>
    );
  }
  // PROGRESO (reading / workout habits): this month against the last, from a bounded window.
  let progress: ReactNode = null;
  if (logType !== "none") {
    const windowStart = logWindowStart(today);
    const { data: todayCheckin } = await supabase
      .from("checkins")
      .select("id")
      .eq("habit_id", habit.id)
      .eq("local_date", today)
      .maybeSingle();
    let todayEntry: { logged: boolean } | null = null;
    if (todayCheckin) {
      const { count } = await supabase
        .from(logType === "reading" ? "reading_entries" : "workout_sessions")
        .select("id", { count: "exact", head: true })
        .eq("checkin_id", todayCheckin.id);
      todayEntry = { logged: (count ?? 0) > 0 };
    }
    if (logType === "reading") {
      const { books, entries } = await loadReadingData(supabase, user.id, windowStart);
      progress = (
        <ReadingProgress
          habitId={habit.id}
          month={thisMonth}
          today={today}
          books={books}
          entries={entries}
          todayEntry={todayEntry}
        />
      );
    } else {
      const [{ exercises, sets, sessions }, visits] = await Promise.all([
        loadWorkoutData(supabase, user.id, windowStart),
        loadVisitDates(supabase, user.id, windowStart),
      ]);
      progress = (
        <WorkoutProgress
          habitId={habit.id}
          month={thisMonth}
          today={today}
          exercises={exercises}
          sets={sets}
          sessions={sessions}
          visits={visits}
          todayEntry={todayEntry}
        />
      );
    }
  }

  const meta = [
    frequency.type === "weekly" ? `${frequency.target} por semana` : "Diario",
    habit.requires_photo ? "foto en vivo" : null,
    VISIBILITY_LABEL[habit.visibility as Visibility].toLowerCase(),
  ].filter(Boolean);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
      <div className="flex items-center">
        <Link href="/" className="flex h-11 items-center gap-1 text-[17px] text-accent">
          <CaretLeft size={20} weight="light" aria-hidden />
          Hoy
        </Link>
      </div>
      <div className="flex items-center gap-3" data-habit-color={color}>
        {/* identity tile: soft fill + solid hairline in the habit color, icon stays ink */}
        <span
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-md bg-(--habit-soft) text-ink ring-[1.5px] ring-inset ring-(--habit)"
        >
          <HabitIcon name={habit.icon as IconKey} size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-display font-semibold text-ink">{habit.name}</h1>
          <p className="flex items-center gap-1.5 text-small text-muted">
            <VisibilityIcon value={habit.visibility as Visibility} />
            {meta.join(" · ")}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Card accent accentColor={color} className="flex-1 p-4 pl-[19px]">
          <p className="text-small text-muted">Racha actual</p>
          <p className="flex items-baseline gap-1.5">
            <span className="font-mono text-[40px] font-semibold leading-none tracking-[-0.02em] text-ink">
              {current}
            </span>
            <span className="text-small text-muted">{unit(current)}</span>
          </p>
        </Card>
        <Card className="flex-1 p-4">
          <p className="text-small text-muted">Mejor racha</p>
          <p className="flex items-baseline gap-1.5">
            <span className="font-mono text-[40px] font-semibold leading-none tracking-[-0.02em] text-ink">
              {best}
            </span>
            <span className="text-small text-muted">{unit(best)}</span>
          </p>
        </Card>
      </div>

      {calendar}

      {progress ? (
        <>
          <SectionHeader label="Progreso" />
          {progress}
        </>
      ) : null}

      <SectionHeader label="Últimas 8 semanas" action={`Meta ${target}`} />
      <Card className="flex flex-col gap-2 p-4">
        <WeeklyBars data={weeklyCounts(dates, 8, today)} target={target} color={color} />
        <p className="text-small text-muted">Barras grises: semanas bajo la meta.</p>
      </Card>

      {goals.length > 0 ? (
        <>
          <SectionHeader label="Meta" action="Ver metas" href="/metas" />
          <Card accent className="divide-y divide-line py-1 pl-[19px] pr-4">
            {goals.map((g) => (
              <GoalCard key={g.id} goal={g} archivable={false} />
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader label="Ajustes" />
      <HabitSettings habitId={habit.id} visibility={habit.visibility as Visibility} />

      <div className="flex gap-3">
        <ButtonLink href={`/habitos/${habit.id}/editar`} variant="secondary">
          <PencilSimple size={20} weight="light" aria-hidden />
          Editar
        </ButtonLink>
        <ButtonLink href={`/retos/nuevo?habito=${habit.id}`}>
          <Trophy size={20} weight="light" aria-hidden />
          Retar a un amigo
        </ButtonLink>
      </div>
    </main>
  );
}
