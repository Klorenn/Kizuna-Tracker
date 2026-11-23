import { Plus } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { MonthOverviewGrid } from "@/components/calendar/MonthOverviewGrid";
import { MonthlyBars } from "@/components/charts/MonthlyBars";
import { StackedBars } from "@/components/charts/StackedBars";
import { WeeklyBars } from "@/components/charts/WeeklyBars";
import { HabitSwitcher } from "@/components/HabitSwitcher";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
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
import { bestStreak, dailyStreak, weeklyStreak } from "@/domain/streaks";
import type { Frequency, LocalDate } from "@/domain/types";
import { loadFirstCheckinDate, loadMonthDays } from "@/lib/calendar-data";
import { monthOverview } from "@/lib/calendar-days";
import {
  ALL_HABITS,
  monthlyCounts,
  profileStreaks,
  stackRows,
  weeklyCounts,
} from "@/lib/stats";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Resumen" };

/** One year back, per habit: always under the API cap of 1000 rows per query. */
const HISTORY_DAYS = 366;
/** "Ver por meses": up to a year of months (all inside HISTORY_DAYS). */
const OVERVIEW_MONTHS = 12;
/** `?vista=meses` shows the month-by-month view instead of the calendar. */
const MONTHS_VIEW = "meses";

function StreakCards({
  current,
  best,
  color,
}: {
  current: { value: number; label: string };
  best: { value: number; label: string };
  color?: ReturnType<typeof toHabitColor>;
}) {
  return (
    <div className="flex gap-3">
      <Card accent accentColor={color} className="flex-1 p-4 pl-[19px]">
        <p className="text-small text-muted">Racha actual</p>
        <p className="flex items-baseline gap-1.5">
          <span className="font-mono text-[40px] font-semibold leading-none tracking-[-0.02em] text-ink">{current.value}</span>
          <span className="text-small text-muted">{current.label}</span>
        </p>
      </Card>
      <Card className="flex-1 p-4">
        <p className="text-small text-muted">Mejor racha</p>
        <p className="flex items-baseline gap-1.5">
          <span className="font-mono text-[40px] font-semibold leading-none tracking-[-0.02em] text-ink">{best.value}</span>
          <span className="text-small text-muted">{best.label}</span>
        </p>
      </Card>
    </div>
  );
}

const unitLabel = (n: number, unit: "days" | "weeks") =>
  unit === "days" ? (n === 1 ? "día" : "días") : n === 1 ? "semana" : "semanas";

export default async function ResumenPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string; mes?: string | string[]; vista?: string }>;
}) {
  const { h, mes, vista } = await searchParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/login?error=perfil");

  const { data: habitRows } = await supabase
    .from("habits")
    .select("id,name,icon,color,frequency_type,target_per_week,created_at")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("created_at");
  const habits = (habitRows ?? []).map((x) => ({ ...x, color: toHabitColor(x.color) }));

  if (habits.length === 0) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-8">
        <h1 className="text-[44px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">Resumen</h1>
        <Card>
          <EmptyState
            title="Todavía no tienes hábitos"
            body="Cuando marques tus primeros check-ins verás aquí tus rachas y gráficos."
            action={
              <ButtonLink href="/habitos/nuevo" className="w-auto!">
                <Plus size={20} weight="light" aria-hidden />
                Crear hábito
              </ButtonLink>
            }
          />
        </Card>
      </main>
    );
  }

  const tz = profile.timezone;
  const showAll = habits.length > 1 && (h === undefined || h === ALL_HABITS || !habits.some((x) => x.id === h));
  const habit = habits.find((x) => x.id === h) ?? habits[0];
  const selected = showAll ? habits : [habit];
  const today = localDate(new Date(), tz);
  const since = (x: { created_at: string }): LocalDate => localDate(new Date(x.created_at), tz);

  // Month in the URL (?mes=YYYY-MM), clamped between the first record and this month.
  const current = monthOf(today);
  const firstCheckin = await loadFirstCheckinDate(supabase, user.id, selected.map((x) => x.id));
  const earliest = earliestMonth([firstCheckin, ...selected.map(since)], current);
  const month = parseMonthParam(mes, { current, earliest });
  const nav = monthNav(month, { current, earliest });
  const monthsView = vista === MONTHS_VIEW;
  const hParam = showAll ? (h === ALL_HABITS ? ALL_HABITS : undefined) : h === habit.id ? habit.id : undefined;
  const mesParam = month === current ? undefined : month;
  const href = (m: MonthKey, view?: string) =>
    withSearch("/resumen", { h: hParam, mes: m === current ? undefined : m, vista: view });

  const switcher = (
    <HabitSwitcher
      habits={habits.map((x) => ({ id: x.id, name: x.name, color: x.color }))}
      value={showAll ? ALL_HABITS : habit.id}
      allValue={ALL_HABITS}
      query={{ mes: mesParam, vista: monthsView ? MONTHS_VIEW : undefined }}
    />
  );

  const datesOf = async (habitId: string) => {
    const { data } = await supabase
      .from("checkins")
      .select("local_date")
      .eq("habit_id", habitId)
      .is("rejected_at", null)
      .gte("local_date", addDays(today, -HISTORY_DAYS));
    return (data ?? []).map((c) => c.local_date);
  };
  const history = await Promise.all(selected.map(async (x) => ({ ...x, dates: await datesOf(x.id) })));

  // Calendar for the visible month only, or the month-by-month view from the year of history.
  const calendarHabits = selected.map((x) => ({ id: x.id, name: x.name, color: x.color, icon: x.icon }));
  let calendarSection: ReactNode;
  if (monthsView) {
    const doneByDay: Record<LocalDate, number> = {};
    for (const x of history) for (const d of new Set(x.dates)) doneByDay[d] = (doneByDay[d] ?? 0) + 1;
    const starts = selected.map((x) => ({ since: since(x) }));
    const months = recentMonths(current, earliest, OVERVIEW_MONTHS);
    calendarSection = (
      <>
        <SectionHeader
          label={months.length === 1 ? "Este mes" : `Últimos ${months.length} meses`}
          action="Ver calendario"
          href={href(month)}
          scroll={false}
        />
        <MonthOverviewGrid
          mode={showAll ? "all" : "single"}
          color={showAll ? undefined : habit.color}
          items={months.map((m) => ({
            overview: monthOverview(m, doneByDay, starts, today),
            href: href(m),
            selected: m === month,
          }))}
        />
      </>
    );
  } else {
    const days = await loadMonthDays(supabase, { userId: user.id, habits: selected, month, today, timezone: tz });
    calendarSection = (
      <>
        <SectionHeader label="Calendario" action="Ver por meses" href={href(month, MONTHS_VIEW)} scroll={false} />
        <Card className="px-3 py-4">
          <MonthCalendar
            month={month}
            today={today}
            habits={calendarHabits}
            days={days}
            mode={showAll ? "all" : "single"}
            prevHref={nav.prev ? href(nav.prev) : null}
            nextHref={nav.next ? href(nav.next) : null}
            todayHref={nav.isCurrent ? null : href(current)}
            note={
              !showAll && habit.frequency_type === "weekly"
                ? `Meta: ${habit.target_per_week ?? 1} por semana.`
                : undefined
            }
          />
        </Card>
      </>
    );
  }

  if (showAll) {
    const { current: currentStreak, best } = profileStreaks(history, today);
    const weekBuckets = weeklyCounts([], 8, today).map((w) => w.weekStart);
    const monthBuckets = monthlyCounts([], 6, today).map((m) => m.month);
    const series = habits.map((x) => ({ id: x.id, name: x.name, color: x.color }));
    const weekly = stackRows(
      weekBuckets,
      history.map((x) => ({ id: x.id, counts: weeklyCounts(x.dates, 8, today).map((c) => c.count) })),
    );
    const monthly = stackRows(
      monthBuckets,
      history.map((x) => ({ id: x.id, counts: monthlyCounts(x.dates, 6, today).map((c) => c.count) })),
    );

    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-8">
        <h1 className="text-[44px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">Resumen</h1>
        {switcher}
        <StreakCards
          current={{ value: currentStreak.value, label: unitLabel(currentStreak.value, currentStreak.unit) }}
          best={{ value: best.value, label: unitLabel(best.value, best.unit) }}
        />

        {calendarSection}

        <SectionHeader label="Últimas 8 semanas" action="Check-ins" />
        <Card className="p-4">
          <StackedBars rows={weekly} series={series} kind="week" />
        </Card>

        <SectionHeader label="Por mes" action="Check-ins" />
        <Card className="p-4">
          <StackedBars rows={monthly} series={series} kind="month" />
        </Card>
      </main>
    );
  }

  const dates = history[0].dates;
  const frequency: Frequency =
    habit.frequency_type === "weekly"
      ? { type: "weekly", target: habit.target_per_week ?? 1 }
      : { type: "daily" };
  const currentStreak =
    frequency.type === "daily" ? dailyStreak(dates, today) : weeklyStreak(dates, frequency.target, today);
  const best = bestStreak(dates, frequency);
  const unit = frequency.type === "daily" ? "days" : "weeks";
  const target = frequency.type === "weekly" ? frequency.target : 7;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-8">
      <h1 className="text-[44px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">Resumen</h1>
      {switcher}
      <StreakCards
        current={{ value: currentStreak, label: unitLabel(currentStreak, unit) }}
        best={{ value: best, label: unitLabel(best, unit) }}
        color={habit.color}
      />

      {calendarSection}

      <SectionHeader label="Últimas 8 semanas" action={`Meta ${target}`} />
      <Card className="flex flex-col gap-2 p-4">
        <WeeklyBars data={weeklyCounts(dates, 8, today)} target={target} color={habit.color} />
        <p className="text-small text-muted">Barras grises: semanas bajo la meta.</p>
      </Card>

      <SectionHeader label="Por mes" action="Check-ins" />
      <Card className="p-4">
        <MonthlyBars data={monthlyCounts(dates, 6, today)} color={habit.color} />
      </Card>
    </main>
  );
}
