import { Plus } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MonthlyBars } from "@/components/charts/MonthlyBars";
import { WeeklyBars } from "@/components/charts/WeeklyBars";
import { CompletionCalendar } from "@/components/CompletionCalendar";
import { HabitSwitcher } from "@/components/HabitSwitcher";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { addDays, localDate } from "@/domain/dates";
import { bestStreak, dailyStreak, weeklyStreak } from "@/domain/streaks";
import type { Frequency } from "@/domain/types";
import { monthlyCounts, weeklyCounts } from "@/lib/stats";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Resumen" };

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

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
    .select("id,name,frequency_type,target_per_week")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("created_at");
  const habits = habitRows ?? [];

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

  const habit = habits.find((x) => x.id === h) ?? habits[0];
  const today = localDate(new Date(), profile.timezone);
  const { data: checkins } = await supabase
    .from("checkins")
    .select("local_date")
    .eq("habit_id", habit.id)
    .is("rejected_at", null)
    .gte("local_date", addDays(today, -366));
  const dates = (checkins ?? []).map((c) => c.local_date);

  const frequency: Frequency =
    habit.frequency_type === "weekly"
      ? { type: "weekly", target: habit.target_per_week ?? 1 }
      : { type: "daily" };
  const current = frequency.type === "daily" ? dailyStreak(dates, today) : weeklyStreak(dates, frequency.target, today);
  const best = bestStreak(dates, frequency);
  const unit = (n: number) =>
    frequency.type === "daily" ? (n === 1 ? "día" : "días") : n === 1 ? "semana" : "semanas";
  const target = frequency.type === "weekly" ? frequency.target : 7;

  const month = `${today.slice(0, 7)}-01`;
  const monthLabel = `${MONTHS[Number(today.slice(5, 7)) - 1]} ${today.slice(0, 4)}`;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-8">
      <h1 className="text-[44px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">Resumen</h1>
      <HabitSwitcher habits={habits.map((x) => ({ id: x.id, name: x.name }))} value={habit.id} />

      <div className="flex gap-3">
        <Card accent className="flex-1 p-4 pl-[19px]">
          <p className="text-small text-muted">Racha actual</p>
          <p className="flex items-baseline gap-1.5">
            <span className="font-mono text-[40px] font-semibold leading-none tracking-[-0.02em] text-ink">{current}</span>
            <span className="text-small text-muted">{unit(current)}</span>
          </p>
        </Card>
        <Card className="flex-1 p-4">
          <p className="text-small text-muted">Mejor racha</p>
          <p className="flex items-baseline gap-1.5">
            <span className="font-mono text-[40px] font-semibold leading-none tracking-[-0.02em] text-ink">{best}</span>
            <span className="text-small text-muted">{unit(best)}</span>
          </p>
        </Card>
      </div>

      <SectionHeader
        label={monthLabel}
        action={frequency.type === "weekly" ? `${frequency.target} por semana` : undefined}
      />
      <Card className="p-4">
        <CompletionCalendar month={month} today={today} doneDates={dates.filter((d) => d.startsWith(month.slice(0, 7)))} />
      </Card>

      <SectionHeader label="Últimas 8 semanas" action={`Meta ${target}`} />
      <Card className="flex flex-col gap-2 p-4">
        <WeeklyBars data={weeklyCounts(dates, 8, today)} target={target} />
        <p className="text-small text-muted">Barras grises: semanas bajo la meta.</p>
      </Card>

      <SectionHeader label="Por mes" action="Check-ins" />
      <Card className="p-4">
        <MonthlyBars data={monthlyCounts(dates, 6, today)} />
      </Card>
    </main>
  );
}
