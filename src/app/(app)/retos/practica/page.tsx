import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { formatCLP } from "@/domain/ledger";
import { localDate } from "@/domain/dates";
import { practiceReport } from "@/domain/personal-challenge";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/viewer";
import { ClosePractice, PracticeForm } from "./PracticeForm";

export const metadata: Metadata = { title: "Práctica" };

export default async function PracticePage() {
  const user = await getSessionUser();
  if (!user) redirect("/bienvenida");
  const supabase = await createServerClient();
  const [{ data: habits }, { data: open }] = await Promise.all([
    supabase.from("habits").select("id,name").eq("user_id", user.id).is("archived_at", null).order("created_at"),
    supabase
      .from("personal_challenges")
      .select("id,habit_id,target_per_week,weeks,fine_amount,starts_on,timezone")
      .eq("user_id", user.id)
      .is("cancelled_at", null)
      .maybeSingle(),
  ]);

  let current: { name: string; line: string; finished: boolean } | null = null;
  if (open) {
    const [{ data: habit }, { data: marks }] = await Promise.all([
      supabase.from("habits").select("name").eq("id", open.habit_id).maybeSingle(),
      supabase.from("checkins").select("local_date").eq("habit_id", open.habit_id).gte("local_date", open.starts_on),
    ]);
    const report = practiceReport(
      {
        startsOn: open.starts_on,
        weeks: open.weeks,
        frequency: { type: "weekly", target: open.target_per_week ?? 1 },
        fineAmount: open.fine_amount,
      },
      (marks ?? []).map((m) => m.local_date),
      localDate(new Date(), open.timezone),
    );
    current = {
      name: habit?.name ?? "Hábito",
      finished: report.finished,
      line: report.finished
        ? report.owed > 0
          ? `Terminó. Anotas ${formatCLP(report.owed)} de práctica.`
          : "Terminó. Cumpliste la práctica."
        : report.current
          ? `Semana ${report.current.index} de ${report.current.total}: ${report.current.done} de ${report.current.needed}.`
          : "Práctica en curso.",
    };
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-8">
      <Link href="/retos" className="-ml-1 flex h-11 w-fit items-center gap-1 pr-2 text-[17px] text-accent">
        <CaretLeft size={20} weight="light" aria-hidden />
        Retos
      </Link>
      <h1 className="text-[44px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">Práctica</h1>
      <p className="text-body text-muted">
        Un reto contra ti, para probar la multa sin un amigo. No entra en Deudas. Dura de 1 a 4 semanas y cuenta esta semana.
      </p>
      {open && current ? (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-body font-medium text-ink">{current.name}</p>
          <p className="text-small text-ink">{current.line}</p>
          <p className="text-small text-muted">La multa de esta práctica no se suma a tus deudas.</p>
          <ClosePractice id={open.id} finished={current.finished} />
        </Card>
      ) : (habits ?? []).length === 0 ? (
        <Card className="p-4">
          <p className="text-body text-ink">Crea un hábito primero. Puede ser privado.</p>
        </Card>
      ) : (
        <PracticeForm habits={habits ?? []} />
      )}
    </main>
  );
}
