import { CaretRight, Receipt, SignOut } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/(auth)/login/actions";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { GoalCard } from "@/components/GoalCard";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { SettingsRows } from "@/components/SettingsRows";
import { ShareProfileButton } from "@/components/ShareProfileButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { localDate } from "@/domain/dates";
import { formatSignedCLP, netBalances } from "@/domain/ledger";
import { avatarUrl } from "@/lib/avatar";
import { loadGoals } from "@/lib/goals-data";
import { profileShareUrl } from "@/lib/public-profile";
import { siteOrigin } from "@/lib/site-url";
import { challengeRecord, profileStreaks, streakWindow } from "@/lib/stats";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Perfil" };

function Stat({ label, value, border }: { label: string; value: string; border?: string }) {
  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-[2px] p-4 ${border ?? ""}`}>
      <p className="text-small text-muted">{label}</p>
      <p className="text-[17px] font-semibold leading-[1.3] tracking-[-0.02em] text-ink">{value}</p>
    </div>
  );
}

const streakLabel = (s: { value: number; unit: "days" | "weeks" }) =>
  s.unit === "weeks" ? `${s.value} ${s.value === 1 ? "semana" : "semanas"}` : `${s.value} ${s.value === 1 ? "día" : "días"}`;

export default async function PerfilPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");
  const { data: profile } = await supabase
    .from("profiles")
    .select("username,first_name,last_name,avatar_path,avatar_updated_at,timezone,reminder_time")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/login?error=perfil");

  const today = localDate(new Date(), profile.timezone);
  const [{ data: habits }, goals, record, { data: debtRows }] = await Promise.all([
    supabase
      .from("habits")
      .select("id,frequency_type,target_per_week")
      .eq("user_id", user.id)
      .is("archived_at", null),
    loadGoals(supabase, user.id, today),
    challengeRecord(user.id),
    supabase.from("debts").select("id,debtor_id,creditor_id,amount,paid_at"),
  ]);

  // History per habit, bounded by date and row count (the API caps a query at 1000 rows)
  const { from, limit } = streakWindow(today);
  const history = await Promise.all(
    (habits ?? []).map(async (h) => {
      const { data } = await supabase
        .from("checkins")
        .select("local_date")
        .eq("habit_id", h.id)
        .is("rejected_at", null)
        .gte("local_date", from)
        .order("local_date", { ascending: false })
        .limit(limit);
      return { ...h, dates: (data ?? []).map((c) => c.local_date) };
    }),
  );
  const { current, best } = profileStreaks(history, today);

  const balances = netBalances(
    (debtRows ?? []).map((d) => ({
      id: d.id,
      debtorId: d.debtor_id,
      creditorId: d.creditor_id,
      amount: d.amount,
      paidAt: d.paid_at,
    })),
    user.id,
  );
  const net = [...balances.values()].reduce((a, b) => a + b, 0);

  const name = `${profile.first_name} ${profile.last_name}`;
  const shareUrl = profileShareUrl(siteOrigin(await headers()), profile.username);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-8">
      <h1 className="text-[44px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">Perfil</h1>
      <ProfileAvatar name={name} username={profile.username} src={avatarUrl(profile.avatar_path, profile.avatar_updated_at)} />

      <Card>
        <div className="flex border-b border-line">
          <Stat label="Racha actual" value={streakLabel(current)} border="border-r border-line" />
          <Stat label="Mejor racha" value={streakLabel(best)} />
        </div>
        <div className="flex">
          <Stat label="Retos ganados" value={String(record.won)} border="border-r border-line" />
          <Stat label="Retos perdidos" value={String(record.lost)} />
        </div>
      </Card>

      <ShareProfileButton kind="profile" url={shareUrl} />

      <SectionHeader label="Metas" action="Ver todas" href="/metas" />
      {goals.length === 0 ? (
        <Link href="/metas" className="text-body text-accent">
          Crear tu primera meta
        </Link>
      ) : (
        <Card accent className="divide-y divide-line py-1 pl-[19px] pr-4">
          {goals.slice(0, 2).map((g) => (
            <GoalCard key={g.id} goal={g} archivable={false} />
          ))}
        </Card>
      )}

      <SectionHeader label="Cuenta" />
      <Card>
        <Link href="/deudas" className="flex h-[52px] items-center gap-3 px-4">
          <Receipt size={20} weight="light" aria-hidden />
          <span className="flex-1 text-body text-ink">Deudas</span>
          <span className="font-mono text-[15px] font-medium text-muted">{net === 0 ? "$0" : formatSignedCLP(net)}</span>
          <CaretRight size={20} weight="light" className="text-muted" aria-hidden />
        </Link>
        <div className="border-t border-line">
          <SettingsRows
            firstName={profile.first_name}
            lastName={profile.last_name}
            reminderTime={String(profile.reminder_time).slice(0, 5)}
            timezone={profile.timezone}
          />
        </div>
      </Card>

      <form action={signOut}>
        <Button type="submit" variant="secondary">
          <SignOut size={20} weight="light" aria-hidden />
          Cerrar sesión
        </Button>
      </form>
      <DeleteAccountButton username={profile.username} />
      <p className="text-center text-small text-muted">
        Se borran tus fotos y datos. Tus amigos conservan el historial de deudas como &quot;cuenta eliminada&quot;.
      </p>
    </main>
  );
}
