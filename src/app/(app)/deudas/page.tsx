import { CaretLeft, Check, Clock } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Pill } from "@/components/ChallengeCard";
import { DebtButton } from "@/components/DebtButton";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { periodsFor } from "@/domain/challenges";
import { formatCLP, formatSignedCLP, netBalances } from "@/domain/ledger";
import { challengeFrequency, firstName } from "@/lib/challenge-view";
import { fetchAll } from "@/lib/paginate";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Deudas" };

const DELETED = "Cuenta eliminada";
const HISTORY_LIMIT = 30;

type ChallengeRow = {
  id: string;
  creator_id: string;
  creator_habit_id: string;
  rival_habit_id: string | null;
  frequency_type: string;
  target_per_week: number | null;
  weeks: number;
  starts_on: string | null;
};

export default async function DeudasPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");

  // balances are summed from every debt: a capped read (1000 rows) would misreport money
  const debts = await fetchAll((from, to) =>
    supabase
      .from("debts")
      .select("id,challenge_id,period_start,debtor_id,creditor_id,amount,paid_at,created_at")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );

  const otherOf = (d: { debtor_id: string; creditor_id: string }) => (d.debtor_id === user.id ? d.creditor_id : d.debtor_id);
  const people = [...new Set(debts.map(otherOf))];
  const challengeIds = [...new Set(debts.map((d) => d.challenge_id))];

  const { data: challengeRows } = challengeIds.length
    ? await supabase
        .from("challenges")
        .select("id,creator_id,creator_habit_id,rival_habit_id,frequency_type,target_per_week,weeks,starts_on")
        .in("id", challengeIds)
    : { data: [] as ChallengeRow[] };
  const challenges = new Map((challengeRows ?? []).map((c) => [c.id, c]));
  const habitIds = [
    ...new Set((challengeRows ?? []).flatMap((c) => [c.creator_habit_id, c.rival_habit_id].filter((x): x is string => !!x))),
  ];

  const [{ data: profiles }, { data: habits }] = await Promise.all([
    people.length
      ? supabase.from("public_profiles").select("id,display_name").in("id", people)
      : Promise.resolve({ data: [] as { id: string | null; display_name: string | null }[] }),
    habitIds.length
      ? supabase.from("habits").select("id,name").in("id", habitIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  // A profile missing from public_profiles is a deleted account.
  const nameOf = new Map((profiles ?? []).flatMap((p) => (p.id ? [[p.id, p.display_name ?? ""] as const] : [])));
  const habitName = new Map((habits ?? []).map((h) => [h.id, h.name]));
  const personName = (id: string) => (nameOf.has(id) ? nameOf.get(id) || DELETED : DELETED);
  const shortName = (id: string) => (nameOf.has(id) ? firstName(nameOf.get(id), DELETED) : DELETED);

  /** "Gimnasio · semana 2": the debtor's habit and the period's position in the challenge. */
  const reason = (d: (typeof debts)[number]) => {
    const c = challenges.get(d.challenge_id);
    if (!c) return "Reto";
    const habitId = d.debtor_id === c.creator_id ? c.creator_habit_id : c.rival_habit_id;
    const name = (habitId && habitName.get(habitId)) || "Reto";
    const f = challengeFrequency(c);
    const idx = c.starts_on ? periodsFor(c.starts_on, c.weeks, f).findIndex((p) => p.start === d.period_start) : -1;
    return idx === -1 ? name : `${name} · ${f.type === "weekly" ? "semana" : "día"} ${idx + 1}`;
  };

  const ledger = debts.map((d) => ({
    id: d.id,
    debtorId: d.debtor_id,
    creditorId: d.creditor_id,
    amount: d.amount,
    paidAt: d.paid_at,
  }));
  const balances = netBalances(ledger, user.id);
  const total = [...balances.values()].reduce((a, b) => a + b, 0);
  const totalLine = total === 0 ? "$0 · estás a mano" : `${formatSignedCLP(total)} ${total > 0 ? "a tu favor" : "en tu contra"}`;

  const friends = people
    .map((id) => {
      const balance = balances.get(id) ?? 0;
      const unpaid = debts.filter((d) => otherOf(d) === id && !d.paid_at);
      return { id, balance, unpaid, owedToMe: unpaid.filter((d) => d.creditor_id === user.id) };
    })
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  const history = debts.slice(0, HISTORY_LIMIT);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-1">
      <Link href="/perfil" className="flex h-11 items-center gap-1 text-[17px] text-accent">
        <CaretLeft size={20} weight="light" aria-hidden />
        Perfil
      </Link>
      <h1 className="text-display font-semibold text-ink">Deudas</h1>

      <Card accent className="flex flex-col gap-1 p-4 pl-[19px]">
        <p className="text-small text-muted">Saldo neto</p>
        <p className="text-title font-semibold text-ink">{totalLine}</p>
        <p className="text-small text-muted">La app solo registra deudas. El pago se hace fuera de la app.</p>
      </Card>

      {friends.length === 0 ? (
        <Card className="p-4">
          <p className="text-body text-muted">Aún no tienes deudas. Aparecen cuando alguien no cumple un reto.</p>
        </Card>
      ) : (
        <>
          <SectionHeader label="Por amigo" />
          <Card className="flex flex-col px-4 py-1">
            {friends.map((f, i) => {
              const name = shortName(f.id);
              const title =
                f.balance > 0
                  ? `${name} te debe ${formatCLP(f.balance)}`
                  : f.balance < 0
                    ? `Le debes ${formatCLP(-f.balance)} a ${name}`
                    : `${name} y tú están a mano`;
              const mineOwed = f.unpaid.filter((d) => d.debtor_id === user.id);
              const sub =
                f.balance === 0
                  ? f.unpaid.length > 0
                    ? "Las deudas se compensan"
                    : "Sin deudas pendientes"
                  : f.balance > 0
                    ? f.unpaid.length === 1
                      ? `Reto ${reason(f.unpaid[0])}`
                      : `${f.unpaid.length} deudas pendientes`
                    : mineOwed.length === 1
                      ? `Reto ${reason(mineOwed[0])} · solo ${name} puede marcarla como pagada`
                      : `Solo ${name} puede marcarlas como pagadas`;
              return (
                <div key={f.id} className={`flex flex-col gap-3 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
                  <div className="flex items-center gap-3">
                    <Avatar name={personName(f.id)} />
                    <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                      <p className="text-body font-medium text-ink">{title}</p>
                      <p className="text-small text-muted">{sub}</p>
                    </div>
                  </div>
                  {/* Only when it is unambiguous: they owe me net, through exactly one debt. Otherwise per row in Historial. */}
                  {f.balance > 0 && f.owedToMe.length === 1 ? (
                    <DebtButton debtIds={[f.owedToMe[0].id]} paid label="Marcar como pagada" />
                  ) : null}
                </div>
              );
            })}
          </Card>

          <SectionHeader label="Historial" />
          <Card className="flex flex-col px-4 py-1">
            {history.map((d, i) => {
              const mineCredit = d.creditor_id === user.id;
              const who = d.debtor_id === user.id ? "Tú" : shortName(d.debtor_id);
              const to = d.creditor_id === user.id ? "tú" : shortName(d.creditor_id);
              return (
                <div key={d.id} className={`flex flex-col gap-2 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                      <p className="text-body text-ink">
                        {who} → {to}
                      </p>
                      <p className="text-small text-muted">{reason(d)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <p className="font-mono text-[15px] font-medium text-ink">{formatCLP(d.amount)}</p>
                      {d.paid_at ? (
                        <Pill icon={<Check size={14} weight="light" aria-hidden />}>Pagada</Pill>
                      ) : (
                        <Pill icon={<Clock size={14} weight="light" aria-hidden />}>Pendiente</Pill>
                      )}
                    </div>
                  </div>
                  {mineCredit && d.paid_at ? (
                    <DebtButton debtIds={[d.id]} paid={false} label="Desmarcar como pagada" variant="ghost" />
                  ) : null}
                  {mineCredit && !d.paid_at ? <DebtButton debtIds={[d.id]} paid label="Marcar como pagada" /> : null}
                </div>
              );
            })}
          </Card>
        </>
      )}
    </main>
  );
}
