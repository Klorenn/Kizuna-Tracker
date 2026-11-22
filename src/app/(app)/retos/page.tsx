import { Plus } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChallengeCard, type ChallengeCardData } from "@/components/ChallengeCard";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { localDate } from "@/domain/dates";
import {
  challengeFrequency,
  countDone,
  dayMonthLabel,
  endsOn,
  firstName,
  frequencyLabel,
  periodStatus,
  weekdayLabel,
} from "@/lib/challenge-view";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Retos" };

export default async function RetosPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");

  const { data: rows } = await supabase
    .from("challenges")
    .select(
      "id,creator_id,rival_id,creator_habit_id,rival_habit_id,frequency_type,target_per_week,requires_photo,weeks,fine_amount,timezone,status,starts_on,created_at",
    )
    .in("status", ["proposed", "active", "finished", "cancelled"])
    .order("created_at", { ascending: false });
  const challenges = rows ?? [];

  const otherOf = (c: { creator_id: string; rival_id: string }) =>
    c.creator_id === user.id ? c.rival_id : c.creator_id;
  const people = [...new Set(challenges.map(otherOf))];
  const habitIds = [
    ...new Set(challenges.flatMap((c) => [c.creator_habit_id, c.rival_habit_id].filter((x): x is string => !!x))),
  ];

  const [{ data: profiles }, { data: habits }, { data: myHabits }, { data: debts }, { data: checkins }] =
    await Promise.all([
      people.length
        ? supabase.from("public_profiles").select("id,display_name").in("id", people)
        : Promise.resolve({ data: [] }),
      habitIds.length
        ? supabase.from("habits").select("id,name").in("id", habitIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from("habits")
        .select("id,name,requires_photo")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .neq("visibility", "private"),
      supabase.from("debts").select("challenge_id,debtor_id,creditor_id,amount,paid_at"),
      habitIds.length
        ? supabase.from("checkins").select("habit_id,local_date").in("habit_id", habitIds).is("rejected_at", null)
        : Promise.resolve({ data: [] }),
    ]);
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, firstName(p.display_name)]));
  const habitName = new Map((habits ?? []).map((h) => [h.id, h.name]));
  const eligible = (myHabits ?? []).map((h) => ({ id: h.id, name: h.name, requiresPhoto: h.requires_photo }));
  const datesByHabit = new Map<string, string[]>();
  for (const k of checkins ?? []) datesByHabit.set(k.habit_id, [...(datesByHabit.get(k.habit_id) ?? []), k.local_date]);

  const now = new Date();
  const cards = challenges.map((c): { status: string; data: ChallengeCardData } => {
    const mine = c.creator_id === user.id;
    const other = nameOf.get(otherOf(c)) ?? "Tu amigo";
    const creatorHabit = habitName.get(c.creator_habit_id) ?? "Hábito";
    const rivalHabit = c.rival_habit_id ? habitName.get(c.rival_habit_id) : undefined;
    const myHabit = mine ? creatorHabit : (rivalHabit ?? creatorHabit);
    const theirHabitId = mine ? c.rival_habit_id : c.creator_habit_id;
    const myHabitId = mine ? c.creator_habit_id : c.rival_habit_id;
    const f = challengeFrequency(c);
    const base = {
      id: c.id,
      otherName: other,
      habitName: myHabit,
      fine: c.fine_amount,
      requiresPhoto: c.requires_photo,
    };
    const proposalSummary = [frequencyLabel(f), `${c.weeks} ${c.weeks === 1 ? "semana" : "semanas"}`].join(" · ");

    if (c.status === "proposed") {
      return {
        status: c.status,
        data: {
          ...base,
          kind: mine ? "outgoing" : "incoming",
          habitName: creatorHabit,
          summary: mine ? proposalSummary : `${creatorHabit} · ${proposalSummary}`,
          habits: eligible,
        },
      };
    }

    const closing = endsOn(c);
    if (c.status === "active") {
      const today = localDate(now, c.timezone);
      const st = periodStatus(c, today);
      const myDates = myHabitId ? (datesByHabit.get(myHabitId) ?? []) : [];
      const theirDates = theirHabitId ? (datesByHabit.get(theirHabitId) ?? []) : [];
      let summary = "";
      let progress: ChallengeCardData["progress"];
      if (st.state === "pending") {
        summary = `Empieza el ${c.starts_on ? weekdayLabel(c.starts_on) : ""} · ${frequencyLabel(f).toLowerCase()}`;
      } else if (st.state === "over") {
        summary = "Cerrando el último período";
      } else if (f.type === "weekly") {
        summary = `Semana ${st.index} de ${st.total} · cierra el ${weekdayLabel(st.period.end)}`;
        progress = {
          type: "weekly",
          target: f.target,
          you: countDone(st.period, myDates),
          them: countDone(st.period, theirDates),
        };
      } else {
        summary = `Diario · día ${st.index} de ${st.total}`;
        progress = {
          type: "daily",
          youDone: countDone(st.period, myDates) > 0,
          themDone: countDone(st.period, theirDates) > 0,
        };
      }
      return { status: c.status, data: { ...base, kind: "active", summary, progress } };
    }

    // finished / cancelled
    const mineDebts = (debts ?? []).filter((d) => d.challenge_id === c.id);
    const iOwe = mineDebts.filter((d) => d.debtor_id === user.id).reduce((s, d) => s + d.amount, 0);
    const theyOwe = mineDebts.filter((d) => d.creditor_id === user.id).reduce((s, d) => s + d.amount, 0);
    const theyFailed = mineDebts.filter((d) => d.debtor_id !== user.id).length;
    const outcome =
      c.status === "cancelled" ? "Cancelado" : theyOwe > iOwe ? "Ganaste" : theyOwe < iOwe ? "Perdiste" : "Empate";
    const unit = f.type === "daily" ? "días" : "semanas";
    const summary =
      c.status === "cancelled"
        ? "Cancelado entre los dos"
        : `Terminó el ${closing ? dayMonthLabel(closing) : ""}${theyFailed > 0 ? ` · ${other} falló ${theyFailed} ${unit}` : ""}`;
    return { status: c.status, data: { ...base, kind: "finished", summary, outcome } };
  });

  const proposed = cards.filter((c) => c.status === "proposed");
  const active = cards.filter((c) => c.status === "active");
  const done = cards.filter((c) => c.status === "finished" || c.status === "cancelled").slice(0, 10);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-1">
      <div className="flex h-11 items-start justify-end pt-1">
        <Link
          href="/retos/nuevo"
          aria-label="Nuevo reto"
          className="flex size-11 items-center justify-center"
        >
          <span className="flex size-10 items-center justify-center rounded-full border-[1.5px] border-accent text-accent">
            <Plus size={20} weight="light" aria-hidden />
          </span>
        </Link>
      </div>
      <h1 className="text-[44px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">Retos</h1>

      {cards.length === 0 ? (
        <Card>
          <EmptyState
            title="Aún no tienes retos"
            body="Rétate con un amigo a cumplir un hábito. Quien falle, anota una multa."
            action={<ButtonLink href="/retos/nuevo">Nuevo reto</ButtonLink>}
          />
        </Card>
      ) : null}

      {proposed.length > 0 ? (
        <>
          <SectionHeader label="Propuestos" action={String(proposed.length)} />
          {proposed.map((c) => (
            <ChallengeCard key={c.data.id} data={c.data} />
          ))}
        </>
      ) : null}
      {active.length > 0 ? (
        <>
          <SectionHeader label="Activos" />
          {active.map((c) => (
            <ChallengeCard key={c.data.id} data={c.data} />
          ))}
        </>
      ) : null}
      {done.length > 0 ? (
        <>
          <SectionHeader label="Terminados" />
          {done.map((c) => (
            <ChallengeCard key={c.data.id} data={c.data} />
          ))}
        </>
      ) : null}

      {cards.length > 0 ? (
        <Link href="/deudas" className="py-2 text-center text-body text-accent">
          Ver deudas
        </Link>
      ) : null}
    </main>
  );
}
