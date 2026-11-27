import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { GoalCard } from "@/components/GoalCard";
import { LoadFailed } from "@/components/LoadFailed";
import { MonthFloorRow } from "@/components/map/MonthFloorRow";
import { NewGoalSheet } from "@/components/NewGoalSheet";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { localDate, weekStart } from "@/domain/dates";
import { loadGoalsResult } from "@/lib/goals-data";
import { loadMyMonth, type Rpc } from "@/lib/outings-data";
import { readRows } from "@/lib/read";
import { createServerClient } from "@/lib/supabase/server";
import { getViewer, viewerMissingDestination } from "@/lib/viewer";

export const metadata: Metadata = { title: "Metas" };

export default async function MetasPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(await viewerMissingDestination());
  const supabase = await createServerClient();

  const now = new Date();
  const today = localDate(now, viewer.timezone);
  const rpc: Rpc = async (fn, args) => {
    const { data, error } = args ? await supabase.rpc(fn, args as never) : await supabase.rpc(fn);
    return { data, error: error ? { message: error.message } : null };
  };
  const [goalsRead, habitsRes, month] = await Promise.all([
    loadGoalsResult(supabase, viewer.id, today),
    supabase.from("habits").select("id,name").eq("user_id", viewer.id).is("archived_at", null).order("created_at"),
    loadMyMonth(rpc),
  ]);
  const habits = readRows(habitsRes);
  const goals = goalsRead.goals;
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
      <MonthFloorRow read={month.ok ? { ok: true, completed: month.data.completed } : { ok: false }} />

      {!goalsRead.ok ? (
        <>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <SectionHeader label={weekLabel} />
            </div>
            <NewGoalSheet habits={habits} />
          </div>
          {/* never goal cards with zero progress when a read failed */}
          <LoadFailed href="/metas" />
        </>
      ) : goals.length === 0 ? (
        <Card>
          <EmptyState
            title="Aún no tienes metas"
            body="Una meta semanal o un total de check-ins te da algo concreto a qué apuntar."
            action={<NewGoalSheet habits={habits} />}
          />
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <SectionHeader label={weekLabel} />
            </div>
            <NewGoalSheet habits={habits} />
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
