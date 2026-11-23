import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PomodoroScreen } from "@/components/logs/PomodoroScreen";
import { localDate } from "@/domain/dates";
import { read } from "@/lib/read";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionUser, getViewerProfile } from "@/lib/viewer";

export const metadata: Metadata = { title: "Pomodoro" };

/** The Pomodoro timer of a `time` habit. 404 for someone else's, archived or non-time habits. */
export default async function PomodoroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  const user = await getSessionUser();
  if (!user) redirect("/bienvenida");
  const [profile, habitRes] = await Promise.all([
    getViewerProfile(),
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
  const habit = read(habitRes);
  if (!habit) notFound();

  const today = localDate(new Date(), profile.timezone);
  const entry = read(await supabase
    .from("time_entries")
    .select("minutes")
    .eq("habit_id", id)
    .eq("user_id", user.id)
    .eq("local_date", today)
    .maybeSingle());

  return (
    <PomodoroScreen
      habitId={habit.id}
      habitName={habit.name}
      preset={habit.preset}
      todayMinutes={entry?.minutes ?? 0}
      userId={user.id}
      timeZone={profile.timezone}
    />
  );
}
