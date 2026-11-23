import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PomodoroScreen } from "@/components/logs/PomodoroScreen";
import { localDate } from "@/domain/dates";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pomodoro" };

/** The Pomodoro timer of a `time` habit. 404 for someone else's, archived or non-time habits. */
export default async function PomodoroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");
  const [{ data: profile }, { data: habit }] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle(),
    supabase
      .from("habits")
      .select("id,name,preset")
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("log_type", "time")
      .is("archived_at", null)
      .maybeSingle(),
  ]);
  if (!profile) redirect("/login?error=perfil");
  if (!habit) notFound();

  const today = localDate(new Date(), profile.timezone);
  const { data: entry } = await supabase
    .from("time_entries")
    .select("minutes")
    .eq("habit_id", id)
    .eq("user_id", user.id)
    .eq("local_date", today)
    .maybeSingle();

  return <PomodoroScreen habitId={habit.id} habitName={habit.name} preset={habit.preset} todayMinutes={entry?.minutes ?? 0} />;
}
