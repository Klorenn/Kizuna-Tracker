import { CaretLeft, PencilSimple, Trophy } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WeeklyBars } from "@/components/charts/WeeklyBars";
import { GoalCard } from "@/components/GoalCard";
import { CompletionCalendar } from "@/components/CompletionCalendar";
import { HabitSettings } from "@/components/HabitSettings";
import { HabitIcon, VISIBILITY_LABEL, VisibilityIcon } from "@/components/habit-icon";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { localDate } from "@/domain/dates";
import { toHabitColor } from "@/domain/habit-colors";
import type { IconKey, Visibility } from "@/domain/presets";
import { bestStreak, dailyStreak, weeklyStreak } from "@/domain/streaks";
import type { Frequency } from "@/domain/types";
import { loadGoals } from "@/lib/goals-data";
import { streakWindow, weeklyCounts } from "@/lib/stats";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Hábito" };

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default async function HabitoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    .select("id,name,icon,color,visibility,requires_photo,frequency_type,target_per_week,archived_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .maybeSingle();
  if (!habit) notFound();

  const color = toHabitColor(habit.color);
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
  const month = `${today.slice(0, 7)}-01`;
  const monthLabel = `${MONTHS[Number(today.slice(5, 7)) - 1]} ${today.slice(0, 4)}`;
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

      <SectionHeader
        label={monthLabel}
        action={frequency.type === "weekly" ? `${frequency.target} por semana` : undefined}
      />
      <Card className="p-4">
        <CompletionCalendar
          month={month}
          today={today}
          doneDates={dates.filter((d) => d.startsWith(month.slice(0, 7)))}
          color={color}
        />
      </Card>

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
