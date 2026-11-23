import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { GoalCard } from "@/components/GoalCard";
import { NewGoalSheet } from "@/components/NewGoalSheet";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { localDate, weekStart } from "@/domain/dates";
import { loadGoals } from "@/lib/goals-data";
import { createServerClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Metas" };

export default async function MetasPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/bienvenida");
  const supabase = await createServerClient();

  const now = new Date();
  const today = localDate(now, viewer.timezone);
  const [goals, { data: habits }] = await Promise.all([
    loadGoals(supabase, viewer.id, today),
    supabase.from("habits").select("id,name").eq("user_id", viewer.id).is("archived_at", null).order("created_at"),
  ]);
  const weekly = goals.filter((g) => g.kind === "weekly");
  const total = goals.filter((g) => g.kind === "total");
  const monday = new TZDate(`${weekStart(today)}T12:00:00`, viewer.timezone);
  const weekLabel = `Esta semana · ${format(monday, "EEE d MMM", { locale: es })}`;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-1">
      <Link href="/perfil" className="flex h-11 items-center gap-1 text-[17px] text-accent">
        <CaretLeft size={20} weight="light" aria-hidden />
        Perfil
      </Link>
      <h1 className="text-display font-semibold text-ink">Metas</h1>

      {goals.length === 0 ? (
        <Card>
          <EmptyState
            title="Aún no tienes metas"
            body="Una meta semanal o un total de check-ins te da algo concreto a qué apuntar."
            action={<NewGoalSheet habits={habits ?? []} />}
          />
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <SectionHeader label={weekLabel} />
            </div>
            <NewGoalSheet habits={habits ?? []} />
          </div>
          {weekly.length > 0 ? (
            <Card accent className="divide-y divide-line py-1 pl-[19px] pr-4">
              {weekly.map((g) => (
                <GoalCard key={g.id} goal={g} />
              ))}
            </Card>
          ) : null}
          {total.length > 0 ? (
            <>
              <SectionHeader label="A largo plazo" />
              <Card className="divide-y divide-line px-4 py-1">
                {total.map((g) => (
                  <GoalCard key={g.id} goal={g} />
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
    </main>
  );
}
