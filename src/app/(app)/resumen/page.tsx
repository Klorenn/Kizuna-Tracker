import { Plus } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MonthlyBars } from "@/components/charts/MonthlyBars";
import { StackedBars } from "@/components/charts/StackedBars";
import { WeeklyBars } from "@/components/charts/WeeklyBars";
import { CompletionCalendar } from "@/components/CompletionCalendar";
import { HabitSwitcher } from "@/components/HabitSwitcher";
import { MultiHabitCalendar } from "@/components/MultiHabitCalendar";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { addDays, localDate } from "@/domain/dates";
import { toHabitColor } from "@/domain/habit-colors";
import { bestStreak, dailyStreak, weeklyStreak } from "@/domain/streaks";
import type { Frequency } from "@/domain/types";
import {
  ALL_HABITS,
  completionsByDay,
  monthlyCounts,
  profileStreaks,
  stackRows,
  weeklyCounts,
} from "@/lib/stats";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Resumen" };

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** One year back, per habit: always under the API cap of 1000 rows per query. */
const HISTORY_DAYS = 366;

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

export default async function ResumenPage({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const { h } = await searchParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/login?error=perfil");

  const { data: habitRows } = await supabase
    .from("habits")
    .select("id,name,color,frequency_type,target_per_week")
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

  const showAll = habits.length > 1 && (h === undefined || h === ALL_HABITS || !habits.some((x) => x.id === h));
  const habit = habits.find((x) => x.id === h) ?? habits[0];
  const today = localDate(new Date(), profile.timezone);
  const month = `${today.slice(0, 7)}-01`;
  const monthLabel = `${MONTHS[Number(today.slice(5, 7)) - 1]} ${today.slice(0, 4)}`;
  const switcher = (
    <HabitSwitcher
      habits={habits.map((x) => ({ id: x.id, name: x.name, color: x.color }))}
      value={showAll ? ALL_HABITS : habit.id}
      allValue={ALL_HABITS}
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

  if (showAll) {
    const history = await Promise.all(habits.map(async (x) => ({ ...x, dates: await datesOf(x.id) })));
    const { current, best } = profileStreaks(history, today);
    const byDay = completionsByDay(history.map((x) => ({ id: x.id, dates: x.dates.filter((d) => d.startsWith(month.slice(0, 7))) })));
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
          current={{ value: current.value, label: unitLabel(current.value, current.unit) }}
          best={{ value: best.value, label: unitLabel(best.value, best.unit) }}
        />

        <SectionHeader label={monthLabel} action="Todos los hábitos" />
        <Card className="p-4">
          <MultiHabitCalendar month={month} today={today} habits={series} doneByDay={Object.fromEntries(byDay)} />
        </Card>

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

  const dates = await datesOf(habit.id);
  const frequency: Frequency =
    habit.frequency_type === "weekly"
      ? { type: "weekly", target: habit.target_per_week ?? 1 }
      : { type: "daily" };
  const current = frequency.type === "daily" ? dailyStreak(dates, today) : weeklyStreak(dates, frequency.target, today);
  const best = bestStreak(dates, frequency);
  const unit = frequency.type === "daily" ? "days" : "weeks";
  const target = frequency.type === "weekly" ? frequency.target : 7;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-8">
      <h1 className="text-[44px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">Resumen</h1>
      {switcher}
      <StreakCards
        current={{ value: current, label: unitLabel(current, unit) }}
        best={{ value: best, label: unitLabel(best, unit) }}
        color={habit.color}
      />

      <SectionHeader
        label={monthLabel}
        action={frequency.type === "weekly" ? `${frequency.target} por semana` : undefined}
      />
      <Card className="p-4">
        <CompletionCalendar
          month={month}
          today={today}
          doneDates={dates.filter((d) => d.startsWith(month.slice(0, 7)))}
          color={habit.color}
        />
      </Card>

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
