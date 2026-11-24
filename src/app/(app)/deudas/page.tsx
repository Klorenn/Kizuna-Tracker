import { CaretLeft, Check, Clock } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Pill } from "@/components/ChallengeCard";
import { DebtButton } from "@/components/DebtButton";
import { GroupFundsSection } from "@/components/debts/GroupFundsSection";
import { Avatar } from "@/components/ui/Avatar";
import { avatarUrl } from "@/lib/avatar";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatCLP, formatSignedCLP, netBalances } from "@/domain/ledger";
import { firstName } from "@/lib/challenge-view";
import { debtReason, type FailedItemRow } from "@/lib/debt-reason";
import { fetchAll } from "@/lib/paginate";
import { readRows } from "@/lib/read";
import { createServerClient } from "@/lib/supabase/server";
import { loadMyFundDebts } from "@/lib/groups-fines-data";
import { getSessionUser } from "@/lib/viewer";
import { fundDebtsForSection } from "./fund-debts";

export const metadata: Metadata = { title: "Deudas" };

const DELETED = "Cuenta eliminada";
const HISTORY_LIMIT = 30;

export default async function DeudasPage() {
  const supabase = await createServerClient();
  const user = await getSessionUser();
  if (!user) redirect("/bienvenida");

  // balances are summed from every debt: a capped read (1000 rows) would misreport money
  // The fund read is independent of the pairwise debts: same parallel load. It never touches the balance below.
  const [debts, fundRes] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("debts")
        .select("id,challenge_id,period_start,debtor_id,creditor_id,amount,paid_at,created_at")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    loadMyFundDebts(),
  ]);
  const fundDebts = fundDebtsForSection(fundRes);

  const otherOf = (d: { debtor_id: string; creditor_id: string }) => (d.debtor_id === user.id ? d.creditor_id : d.debtor_id);
  const people = [...new Set(debts.map(otherOf))];
  const challengeIds = [...new Set(debts.map((d) => d.challenge_id))];

  // Challenge (with the two habit names) and profiles are independent: one level, not three.
  // A habit the viewer cannot read comes back null, as it did when habits were read on their own.
  const [challengesRes, profilesRes, failedRes] = await Promise.all([
    challengeIds.length
      ? supabase
          .from("challenges")
          .select(
            "id,creator_id,creator_habit_id,rival_habit_id,frequency_type,target_per_week,weeks,starts_on,creator_habit:habits!creator_habit_id(name),rival_habit:habits!rival_habit_id(name)",
          )
          .in("id", challengeIds)
      : Promise.resolve({ data: [] }),
    people.length
      ? supabase.from("public_profiles").select("id,display_name,avatar_path,avatar_preset").in("id", people)
      : Promise.resolve({
          data: [] as { id: string | null; display_name: string | null; avatar_path: string | null; avatar_preset: number | null }[],
        }),
    // sub-reto outcomes behind each debt (periods closed before sub-retos have none: legacy reason)
    challengeIds.length
      ? fetchAll<unknown>((from, to) =>
          supabase
            .from("challenge_item_results")
            .select(
              "challenge_id,period_start,player_id,item:challenge_items(creator_habit:habits!creator_habit_id(name),rival_habit:habits!rival_habit_id(name))",
            )
            .eq("met", false)
            .in("challenge_id", challengeIds)
            .order("id")
            .range(from, to),
        ).then((rows) => rows as FailedItemRow[], (): FailedItemRow[] => [])
      : Promise.resolve([] as FailedItemRow[]),
  ]);
  const failedItems = failedRes;
  const challengeRows = readRows(challengesRes);
  const profiles = readRows(profilesRes);
  const challenges = new Map(challengeRows.map((c) => [c.id, c]));
  // A profile missing from public_profiles is a deleted account.
  const nameOf = new Map(profiles.flatMap((p) => (p.id ? [[p.id, p.display_name ?? ""] as const] : [])));
  const profileOf = new Map(profiles.flatMap((p) => (p.id ? [[p.id, p] as const] : [])));
  const personName = (id: string) => (nameOf.has(id) ? nameOf.get(id) || DELETED : DELETED);
  const shortName = (id: string) => (nameOf.has(id) ? firstName(nameOf.get(id), DELETED) : DELETED);

  /** "Agua, Gym · semana 2": the debtor's failed sub-retos and the period's position in the challenge. */
  const reason = (d: (typeof debts)[number]) => debtReason(d, challenges.get(d.challenge_id), failedItems);

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

      <GroupFundsSection data={fundDebts} />

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
                    <Avatar
                      name={personName(f.id)}
                      src={avatarUrl(profileOf.get(f.id)?.avatar_path ?? null)}
                      preset={profileOf.get(f.id)?.avatar_preset}
                      deleted={!profileOf.has(f.id)}
                    />
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
