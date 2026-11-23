import { CaretRight, GearSix, GlobeSimple, Plus, Receipt } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GoalCard } from "@/components/GoalCard";
import { LoadFailed } from "@/components/LoadFailed";
import { BodyCard } from "@/components/profile/BodyCard";
import { ActivityHeatmap } from "@/components/profile/ActivityHeatmap";
import { HabitStrip } from "@/components/profile/HabitStrip";
import { ProfileIdentity } from "@/components/profile/ProfileIdentity";
import { ShareProfileButton } from "@/components/ShareProfileButton";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ListCard, ListRow } from "@/components/ui/ListRow";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { localDate } from "@/domain/dates";
import { toHabitColor } from "@/domain/habit-colors";
import { netBalances } from "@/domain/ledger";
import { dailyStreak, weeklyStreak } from "@/domain/streaks";
import { avatarUrl } from "@/lib/avatar";
import { loadCheckinDates } from "@/lib/checkin-dates";
import { loadGoalsResult } from "@/lib/goals-data";
import { activityGrid, debtSummary, lastDays, memberSince, streakText } from "@/lib/profile-view";
import { profileShareUrl } from "@/lib/public-profile";
import { siteOrigin } from "@/lib/site-url";
import { challengeRecord, profileStreaks, streakWindow } from "@/lib/stats";
import { createServerClient } from "@/lib/supabase/server";
import { loadRecentWeights } from "./body-data";

export const metadata: Metadata = { title: "Perfil" };

function BigStat({ label, value, unit }: { label: string; value: number; unit: "days" | "weeks" }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 p-4">
      <p className="text-small text-muted">{label}</p>
      <p className="flex items-baseline gap-1.5">
        <span className="font-mono text-[36px] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</span>
        <span className="text-small text-muted">{streakText(value, unit)}</span>
      </p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-h-12 min-w-0 items-center justify-between gap-2 px-4">
      <p className="truncate text-small text-muted">{label}</p>
      <p className="font-mono text-[17px] font-semibold text-ink">{value}</p>
    </div>
  );
}

export default async function PerfilPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");
  // Reads that need only the user id start with the profile; the ones that need its timezone follow.
  const [{ data: profile }, { data: habits }, record, { data: debtRows }, bodyEntries] = await Promise.all([
    supabase
      .from("profiles")
      .select("username,first_name,last_name,avatar_path,avatar_updated_at,avatar_preset,timezone,created_at,height_cm")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("habits")
      .select("id,name,color,frequency_type,target_per_week")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("created_at"),
    challengeRecord(user.id),
    supabase.from("debts").select("id,debtor_id,creditor_id,amount,paid_at"),
    loadRecentWeights(supabase, user.id, 5),
  ]);
  if (!profile) redirect("/login?error=perfil");

  const today = localDate(new Date(), profile.timezone);
  // History of every habit in one call (one row per habit), alongside the goals
  const { from } = streakWindow(today);
  const habitRows = habits ?? [];
  const [goalsRead, dated] = await Promise.all([
    loadGoalsResult(supabase, user.id, today),
    loadCheckinDates(supabase, habitRows.map((h) => h.id), from),
  ]);
  // a failed read is a retry line, never a zero streak or an empty strip
  const goals = goalsRead.goals;
  const datesByHabit = dated.ok ? dated.byHabit : new Map<string, string[]>();
  const history = habitRows.map((h) => ({ ...h, color: toHabitColor(h.color), dates: datesByHabit.get(h.id) ?? [] }));
  const { current, best } = profileStreaks(history, today);
  const strip = history.map((h) => {
    const weekly = h.frequency_type === "weekly";
    return {
      id: h.id,
      name: h.name,
      color: h.color,
      streak: {
        value: weekly ? weeklyStreak(h.dates, h.target_per_week ?? 1, today) : dailyStreak(h.dates, today),
        unit: weekly ? ("weeks" as const) : ("days" as const),
      },
      week: lastDays(h.dates, today),
    };
  });
  const activity = activityGrid(history, today);

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
  const debt = debtSummary([...balances.values()].reduce((a, b) => a + b, 0));

  const name = `${profile.first_name} ${profile.last_name}`;
  const shareUrl = profileShareUrl(siteOrigin(await headers()), profile.username);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-5 pb-8 pt-8">
      <header className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[44px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">Perfil</h1>
          <Link
            href="/perfil/ajustes"
            aria-label="Ajustes"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-card transition-colors duration-[120ms] hover:bg-field"
          >
            <GearSix size={22} weight="light" aria-hidden />
          </Link>
        </div>
        <ProfileIdentity
          name={name}
          username={profile.username}
          src={avatarUrl(profile.avatar_path, profile.avatar_updated_at)}
          preset={profile.avatar_preset}
          since={memberSince(profile.created_at, profile.timezone)}
        />
      </header>

      <section aria-label="Tu progreso">
        <Card>
          {dated.ok ? (
            <div className="grid grid-cols-2 divide-x divide-line">
              <BigStat label="Racha actual" value={current.value} unit={current.unit} />
              <BigStat label="Mejor racha" value={best.value} unit={best.unit} />
            </div>
          ) : (
            <div className="px-4 py-2">
              <LoadFailed href="/perfil" />
            </div>
          )}
          <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
            <MiniStat label="Retos ganados" value={record.won} />
            <MiniStat label="Retos perdidos" value={record.lost} />
          </div>
          <Link
            href="/deudas"
            className="flex min-h-[52px] items-center gap-3 border-t border-line px-4 py-2 transition-colors duration-[120ms] hover:bg-field focus-visible:outline-offset-[-2px]"
          >
            <Receipt size={20} weight="light" aria-hidden className="shrink-0 text-ink" />
            <span className="flex-1 text-body text-ink">Deudas</span>
            <span className="flex items-center gap-2">
              <span className="text-small text-muted">{debt.caption}</span>
              <span className="inline-flex h-7 items-center rounded-full border border-line bg-field px-2.5 font-mono text-[14px] font-medium text-ink">
                {debt.amount}
              </span>
            </span>
            <CaretRight size={18} weight="light" aria-hidden className="-mr-1 shrink-0 text-muted" />
          </Link>
        </Card>
      </section>

      <section aria-label="Tus hábitos" className="flex flex-col gap-2">
        <SectionHeader label="Tus hábitos" action="Resumen" href="/resumen" />
        {!dated.ok ? (
          <Card className="px-4 py-2">
            <LoadFailed href="/perfil" />
          </Card>
        ) : strip.length === 0 ? (
          <Card className="flex items-center gap-3 p-4">
            <p className="min-w-0 flex-1 text-body text-muted">Aún no tienes hábitos activos.</p>
            <ButtonLink href="/habitos/nuevo" variant="secondary" className="h-11! w-auto! px-4! text-small!">
              <Plus size={18} weight="light" aria-hidden />
              Crear hábito
            </ButtonLink>
          </Card>
        ) : (
          <Card>
            <HabitStrip habits={strip} />
          </Card>
        )}
      </section>

      {dated.ok && strip.length > 0 ? (
        <section aria-labelledby="perfil-actividad" className="flex flex-col gap-2">
          <h2 id="perfil-actividad" className="section-label flex h-6 items-center gap-2 text-muted">
            <span className="flex-1">Actividad</span>
            <span>12 semanas</span>
          </h2>
          <Card className="p-4">
            <ActivityHeatmap grid={activity} today={today} />
          </Card>
        </section>
      ) : null}

      <section aria-label="Metas" className="flex flex-col gap-2">
        <SectionHeader label="Metas" action={goals.length > 0 ? "Ver todas" : undefined} href="/metas" />
        {!goalsRead.ok ? (
          <Card className="px-4 py-2">
            <LoadFailed href="/perfil" />
          </Card>
        ) : goals.length === 0 ? (
          <Card className="flex items-center gap-3 p-4">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-body text-ink">Aún no tienes metas</span>
              <span className="text-small text-muted">Semanales o a largo plazo</span>
            </span>
            <ButtonLink href="/metas" variant="secondary" className="h-11! w-auto! shrink-0 px-4! text-small!">
              Crear meta
            </ButtonLink>
          </Card>
        ) : (
          <Card accent className="divide-y divide-line py-1 pl-[19px] pr-4">
            {goals.slice(0, 2).map((g) => (
              <GoalCard key={g.id} goal={g} archivable={false} />
            ))}
          </Card>
        )}
      </section>

      <BodyCard entries={bodyEntries.ok ? bodyEntries.rows : null} height={profile.height_cm} today={today} />

      <section aria-labelledby="perfil-publico" className="flex flex-col gap-2">
        <h2 id="perfil-publico" className="section-label text-muted">
          Perfil público
        </h2>
        <ListCard>
          <ShareProfileButton kind="profile" url={shareUrl} variant="row" />
          <ListRow
            href={`/@${profile.username}`}
            icon={<GlobeSimple size={20} weight="light" />}
            label="Ver perfil público"
            hint="Solo tus hábitos públicos, sin fotos"
            chevron
          />
        </ListCard>
      </section>
    </main>
  );
}
