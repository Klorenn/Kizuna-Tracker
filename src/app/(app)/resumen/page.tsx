import { Plus } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { MonthOverviewGrid } from "@/components/calendar/MonthOverviewGrid";
import { MonthlyBarsLazy, StackedBarsLazy, WeeklyBarsLazy } from "@/components/charts/LazyCharts";
import { HabitSwitcher } from "@/components/HabitSwitcher";
import { LogMonthCards } from "@/components/logs/LogMonthCards";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  earliestMonth,
  monthNav,
  monthOf,
  monthTitle,
  parseMonthParam,
  recentMonths,
  withSearch,
  type MonthKey,
} from "@/domain/calendar";
import { addDays, localDate } from "@/domain/dates";
import { toHabitColor } from "@/domain/habit-colors";
import { LOG_TYPES, type LogType } from "@/domain/logs";
import { bestStreak, dailyStreak, weeklyStreak } from "@/domain/streaks";
import type { Frequency, LocalDate } from "@/domain/types";
import { loadFirstCheckinDate, loadMonthDays, loadMonthWeights } from "@/lib/calendar-data";
import { monthOverview } from "@/lib/calendar-days";
import { buildLogCards } from "@/lib/log-cards";
import {
  loadCardioData,
  loadLatestWeight,
  loadQuantityForHabits,
  loadReadingData,
  loadTimeData,
  loadVisitDates,
  loadWatchData,
  loadWeights,
  loadWorkoutData,
  logWindowStart,
  quantityConfigOf,
  type QuantityColumns,
} from "@/lib/logs-data";
import { fetchAll } from "@/lib/paginate";
import {
  ALL_HABITS,
  monthlyCounts,
  profileStreaks,
  stackRows,
  weeklyCounts,
} from "@/lib/stats";
import { readRows } from "@/lib/read";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionUser, getViewerProfile } from "@/lib/viewer";

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

type HabitForCards = { id: string; name: string; logType: LogType } & QuantityColumns;

/**
 * REGISTROS of this month (reading, gym, time, series, quantity, distance and the private
 * weight; each card opens its detail). Reads only what exists, all at once: the data of a
 * kind only when there is a habit of that kind, ONE query for every quantity habit (grouped
 * here), weights always (they do not depend on habits; own Resumen only).
 */
async function loadRegistros(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  today: LocalDate,
  habits: HabitForCards[],
): Promise<ReactNode> {
  const windowStart = logWindowStart(today);
  const has = (t: LogType) => habits.some((h) => h.logType === t);
  const hasReading = has("reading");
  const hasWorkout = has("workout");
  // the first three quantity habits (creation order) get a card
  const quantityHabits = habits
    .filter((h) => h.logType === "quantity")
    .flatMap((h) => {
      const config = quantityConfigOf(h);
      return config ? [{ habitId: h.id, name: h.name, config }] : [];
    })
    .slice(0, 3);
  const [readingData, workoutData, visits, weightEntries, time, watch, quantityData, cardio] = await Promise.all([
    hasReading ? loadReadingData(supabase, userId, windowStart) : null,
    hasWorkout ? loadWorkoutData(supabase, userId, windowStart) : null,
    hasWorkout ? loadVisitDates(supabase, userId, windowStart) : null,
    loadWeights(supabase, userId, windowStart),
    has("time") ? loadTimeData(supabase, userId, windowStart) : null,
    has("watch") ? loadWatchData(supabase, userId, windowStart) : null,
    quantityHabits.length > 0
      ? loadQuantityForHabits(supabase, userId, quantityHabits.map((h) => h.habitId), windowStart)
      : null,
    has("cardio") ? loadCardioData(supabase, userId, windowStart) : null,
  ]);
  // the newest weigh-in may be older than the window: still shown, with its date
  const latestWeight = weightEntries.length === 0 ? await loadLatestWeight(supabase, userId) : null;
  const month = monthOf(today);
  const cards = buildLogCards({
    month,
    reading: readingData,
    workout: workoutData,
    visits,
    weights: weightEntries,
    latestWeight,
    time,
    watch,
    quantity: quantityData
      ? quantityHabits.map((h) => ({
          ...h,
          entries: quantityData.get(h.habitId)?.entries ?? [],
          doneDates: quantityData.get(h.habitId)?.doneDates ?? [],
        }))
      : null,
    cardio,
  });
  if (cards.length === 0) return null;
  return (
    <>
      <SectionHeader label={`Registros · ${monthTitle(month).name}`} />
      <LogMonthCards cards={cards} />
    </>
  );
}

export default async function ResumenPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string; mes?: string | string[]; vista?: string }>;
}) {
  const { h, mes, vista } = await searchParams;
  const supabase = await createServerClient();
  const user = await getSessionUser();
  if (!user) redirect("/bienvenida");
  const [profile, habitsRes] = await Promise.all([
    getViewerProfile(),
    supabase
      .from("habits")
      .select(
        "id,name,icon,color,frequency_type,target_per_week,created_at,log_type,quantity_unit,quantity_label,quantity_target,quantity_step,quantity_display,glass_ml",
      )
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("created_at")
      .order("id"),
  ]);
  if (!profile) redirect("/login?error=perfil");
  const habits = readRows(habitsRes).map((x) => ({
    ...x,
    color: toHabitColor(x.color),
    logType: ((LOG_TYPES as readonly string[]).includes(x.log_type) ? x.log_type : "none") as LogType,
  }));

  if (habits.length === 0) {
    // no habits, but the private weight (REGISTROS > Peso) is still there
    const emptyRegistros = await loadRegistros(supabase, user.id, localDate(new Date(), profile.timezone), []);
    // (no habits: only the private weight card can exist)
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
        {emptyRegistros}
      </main>
    );
  }

  const tz = profile.timezone;
  const showAll = habits.length > 1 && (h === undefined || h === ALL_HABITS || !habits.some((x) => x.id === h));
  const habit = habits.find((x) => x.id === h) ?? habits[0];
  const selected = showAll ? habits : [habit];
  const today = localDate(new Date(), tz);
  const since = (x: { created_at: string }): LocalDate => localDate(new Date(x.created_at), tz);

  // Independent reads in one go: the first check-in (bounds the month), the year of check-ins
  // of the selected habits (ONE query, grouped here) and the REGISTROS cards.
  const current = monthOf(today);
  const selectedIds = selected.map((x) => x.id);
  const [firstCheckin, historyRows, registros] = await Promise.all([
    loadFirstCheckinDate(supabase, user.id, selectedIds),
    fetchAll<{ habit_id: string; local_date: LocalDate }>((a, b) =>
      supabase
        .from("checkins")
        .select("habit_id,local_date")
        .in("habit_id", selectedIds)
        .is("rejected_at", null)
        .gte("local_date", addDays(today, -HISTORY_DAYS))
        .order("local_date")
        .order("id")
        .range(a, b),
    ),
    loadRegistros(supabase, user.id, today, habits),
  ]);
  const datesByHabit = new Map<string, LocalDate[]>();
  for (const r of historyRows) {
    const list = datesByHabit.get(r.habit_id);
    if (list) list.push(r.local_date);
    else datesByHabit.set(r.habit_id, [r.local_date]);
  }

  // Month in the URL (?mes=YYYY-MM), clamped between the first record and this month.
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

  const history = selected.map((x) => ({ ...x, dates: datesByHabit.get(x.id) ?? [] }));

  // Calendar for the visible month only, or the month-by-month view from the year of history.
  const calendarHabits = selected.map((x) => ({
    id: x.id,
    name: x.name,
    color: x.color,
    icon: x.icon,
    logType: x.logType,
  }));
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
    // weigh-ins are private: this is the owner's own calendar, read with their session
    const [days, weights] = await Promise.all([
      loadMonthDays(supabase, { userId: user.id, habits: selected, month, today, timezone: tz, includeLogs: true }),
      loadMonthWeights(supabase, user.id, month),
    ]);
    calendarSection = (
      <>
        <SectionHeader label="Calendario" action="Ver por meses" href={href(month, MONTHS_VIEW)} scroll={false} />
        {/* thin side padding: seven >= 44 px day cells fit from 360 px wide */}
        <Card className="px-1 py-4">
          <MonthCalendar
            month={month}
            today={today}
            habits={calendarHabits}
            days={days}
            mode={showAll ? "all" : "single"}
            prevHref={nav.prev ? href(nav.prev) : null}
            nextHref={nav.next ? href(nav.next) : null}
            todayHref={nav.isCurrent ? null : href(current)}
            weights={weights}
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

        {registros}

        <SectionHeader label="Últimas 8 semanas" action="Check-ins" />
        <Card className="p-4">
          <StackedBarsLazy rows={weekly} series={series} kind="week" />
        </Card>

        <SectionHeader label="Por mes" action="Check-ins" />
        <Card className="p-4">
          <StackedBarsLazy rows={monthly} series={series} kind="month" />
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

      {registros}

      <SectionHeader label="Últimas 8 semanas" action={`Meta ${target}`} />
      <Card className="flex flex-col gap-2 p-4">
        <WeeklyBarsLazy data={weeklyCounts(dates, 8, today)} target={target} color={habit.color} />
        <p className="text-small text-muted">Barras grises: semanas bajo la meta.</p>
      </Card>

      <SectionHeader label="Por mes" action="Check-ins" />
      <Card className="p-4">
        <MonthlyBarsLazy data={monthlyCounts(dates, 6, today)} color={habit.color} />
      </Card>
    </main>
  );
}
