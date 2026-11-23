import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ExerciseOption } from "@/components/logs/ExercisePicker";
import { WorkoutLogger } from "@/components/logs/WorkoutLogger";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { TopBar } from "@/components/ui/TopBar";
import { localDate } from "@/domain/dates";
import { type DayType, type MuscleGroup, type WorkoutDraft } from "@/domain/logs";
import { logDateParam } from "@/lib/log-date";
import { createServerClient } from "@/lib/supabase/server";
import { exercisesFromRows } from "@/lib/workout-form";

export const metadata: Metadata = { title: "Entrenamiento" };

const HISTORY_SESSIONS = 40;

type SessionRow = {
  local_date: string;
  day_types: string[];
  workout_sets: { exercise_id: string; reps: number; weight_kg: number; position: number }[];
};

const toDraft = (s: SessionRow): WorkoutDraft => ({
  dayTypes: s.day_types as DayType[],
  exercises: exercisesFromRows(s.workout_sets),
});

export default async function EntrenamientoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fecha?: string | string[] }>;
}) {
  const { id } = await params;
  const { fecha } = await searchParams;
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
    .select("id,name,log_type")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .maybeSingle();
  if (!habit || habit.log_type !== "workout") notFound();

  const today = localDate(new Date(), profile.timezone);
  const date = logDateParam(fecha, today);
  const [y, m, d] = date.split("-").map(Number);
  const title = `Entrenamiento · ${format(new TZDate(y, m - 1, d, "UTC"), "EEE d MMM", { locale: es })}`;
  const backHref = `/habitos/${id}`;

  const { data: checkin } = await supabase
    .from("checkins")
    .select("id")
    .eq("habit_id", id)
    .eq("user_id", user.id)
    .eq("local_date", date)
    .is("rejected_at", null)
    .maybeSingle();

  if (!checkin) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-4">
        <TopBar backHref={backHref} />
        <h1 className="text-display font-semibold text-ink">{title}</h1>
        <EmptyState
          title="Ese día no tiene check-in"
          body="Los registros se guardan sobre un día cumplido."
          action={<ButtonLink variant="secondary" href={backHref}>Volver al hábito</ButtonLink>}
        />
      </main>
    );
  }

  const [exercisesRes, currentRes, historyRes] = await Promise.all([
    supabase.from("exercises").select("id,user_id,name,muscle_group,archived_at").order("name"),
    supabase
      .from("workout_sessions")
      .select("local_date,day_types,workout_sets(exercise_id,reps,weight_kg,position)")
      .eq("checkin_id", checkin.id)
      .maybeSingle(),
    supabase
      .from("workout_sessions")
      .select("local_date,day_types,workout_sets(exercise_id,reps,weight_kg,position)")
      .eq("user_id", user.id)
      .lt("local_date", date)
      .order("local_date", { ascending: false })
      .limit(HISTORY_SESSIONS),
  ]);

  const exercises: ExerciseOption[] = (exercisesRes.data ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    group: e.muscle_group as MuscleGroup,
    own: e.user_id !== null,
    archived: e.archived_at !== null,
  }));
  const current = currentRes.data as SessionRow | null;
  const history = ((historyRes.data ?? []) as SessionRow[]).map((s) => ({
    date: s.local_date,
    ...toDraft(s),
  }));

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-8 pt-4">
      <TopBar backHref={backHref} />
      <div className="flex flex-col gap-1">
        <h1 className="text-display font-semibold text-ink">{title}</h1>
        <p className="text-body text-muted">{habit.name}</p>
      </div>
      <WorkoutLogger
        key={checkin.id}
        checkinId={checkin.id}
        date={date}
        backHref={backHref}
        exercises={exercises}
        initial={current ? toDraft(current) : null}
        history={history}
      />
    </main>
  );
}
