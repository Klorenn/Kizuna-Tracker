import { CaretLeft, CaretRight, Flag, Receipt, UsersThree } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { ActivityHeatmap } from "@/components/profile/ActivityHeatmap";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ListCard, ListRow } from "@/components/ui/ListRow";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Avatar } from "@/components/ui/Avatar";
import { firstName } from "@/lib/challenge-view";
import type { FriendProfileData } from "@/lib/friend-profile-data";
import { balanceCopy } from "@/lib/friend-view";
import { streakText } from "@/lib/profile-view";
import { ActivityDays } from "./ActivityItem";
import { FriendHabitList } from "./FriendHabitList";
import { FriendOverflow } from "./FriendOverflow";
import { SectionRetry } from "./SectionRetry";

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

/** /@handle for an accepted friend: same visual language as the own Perfil, plus what you share. */
export function FriendProfileView({
  friend,
  data,
  today,
}: {
  friend: { id: string; username: string; name: string; avatar: string | null };
  data: FriendProfileData;
  today: string;
}) {
  const first = firstName(friend.name, friend.name);
  const balance = balanceCopy(data.record.balance, first);
  const open = data.challenges.filter((c) => c.state === "open");
  const done = data.challenges.filter((c) => c.state === "done").slice(0, 10);
  const habitsFailed = data.failed.includes("habits");
  const challengesFailed = data.failed.includes("challenges");
  const latestFailed = data.failed.includes("latest");

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-5 pb-8 pt-1">
      <header className="flex flex-col gap-5">
        <Link href="/amigos" className="-ml-1 flex h-11 w-fit items-center gap-1 text-[17px] text-accent">
          <CaretLeft size={20} weight="light" aria-hidden />
          Amigos
        </Link>
        <div className="flex items-center gap-4">
          <Avatar name={friend.name} size="XL" src={friend.avatar} />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <h1 className="line-clamp-2 break-words text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
              {friend.name}
            </h1>
            <p className="max-w-full truncate font-mono text-[14px] text-muted">@{friend.username}</p>
            <span className="mt-1 inline-flex h-6 items-center gap-1 rounded-full bg-field px-2.5 text-small font-medium text-ink">
              <UsersThree size={14} weight="light" aria-hidden />
              Amigos
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <ButtonLink href={`/retos/nuevo?amigo=${friend.id}`} className="flex-1">
            <Flag size={20} weight="light" aria-hidden />
            Retar
          </ButtonLink>
          <FriendOverflow userId={friend.id} firstName={first} />
        </div>
      </header>

      <section aria-label={`Progreso de ${first}`}>
        {habitsFailed && challengesFailed ? (
          <SectionRetry what="su progreso" />
        ) : (
        <Card>
          {habitsFailed ? null : (
            <div className="grid grid-cols-2 divide-x divide-line">
              <BigStat label="Racha actual" value={data.streaks.current.value} unit={data.streaks.current.unit} />
              <BigStat label="Mejor racha" value={data.streaks.best.value} unit={data.streaks.best.unit} />
            </div>
          )}
          {challengesFailed ? null : (
            <div className={`grid grid-cols-2 divide-x divide-line ${habitsFailed ? "" : "border-t border-line"}`}>
              <MiniStat label="Le ganaste" value={data.record.won} />
              <MiniStat label="Te ganó" value={data.record.lost} />
            </div>
          )}
          {balance && !challengesFailed ? (
            <Link
              href="/deudas"
              className="flex min-h-[52px] items-center gap-3 border-t border-line px-4 py-2 transition-colors duration-[120ms] hover:bg-field focus-visible:outline-offset-[-2px]"
            >
              <Receipt size={20} weight="light" aria-hidden className="shrink-0 text-ink" />
              <span className="min-w-0 flex-1 text-body text-ink">{balance}</span>
              <CaretRight size={18} weight="light" aria-hidden className="-mr-1 shrink-0 text-muted" />
            </Link>
          ) : null}
        </Card>
        )}
      </section>

      <section aria-labelledby="amigo-habitos" className="flex flex-col gap-2">
        <h2 id="amigo-habitos" className="section-label flex h-6 items-center text-muted">
          Sus hábitos
        </h2>
        {habitsFailed ? (
          <SectionRetry what="sus hábitos" />
        ) : data.habits.length === 0 ? (
          <Card className="p-4">
            <p className="text-body text-muted">{first} todavía no comparte hábitos contigo.</p>
          </Card>
        ) : (
          <Card>
            <FriendHabitList habits={data.habits} />
          </Card>
        )}
      </section>

      {data.habits.length > 0 ? (
        <section aria-labelledby="amigo-actividad" className="flex flex-col gap-2">
          <h2 id="amigo-actividad" className="section-label flex h-6 items-center gap-2 text-muted">
            <span className="flex-1">Actividad</span>
            <span>12 semanas</span>
          </h2>
          <Card className="p-4">
            <ActivityHeatmap grid={data.activity} today={today} />
          </Card>
          {latestFailed ? (
            <div className="flex flex-col gap-2 pt-2">
              <h3 className="section-label flex h-6 items-center text-muted">Últimos registros</h3>
              <SectionRetry what="los últimos registros" />
            </div>
          ) : data.latest.items.length > 0 ? (
            <div className="flex flex-col gap-2 pt-2">
              <h3 className="section-label flex h-6 items-center text-muted">Últimos registros</h3>
              <ActivityDays items={data.latest.items} today={today} showPerson={false} />
            </div>
          ) : null}
        </section>
      ) : null}

      <section aria-label="Retos entre ustedes" className="flex flex-col gap-2">
        <SectionHeader label="Retos entre ustedes" action="Ver retos" href="/retos" />
        {challengesFailed ? (
          <SectionRetry what="los retos" />
        ) : data.challenges.length === 0 ? (
          <Card className="p-4">
            <p className="text-body text-muted">Aún no tienen retos. Rétalo a cumplir un hábito.</p>
          </Card>
        ) : (
          <ListCard>
            {[...open, ...done].map((c) => (
              <ListRow
                key={c.id}
                href={`/retos/${c.id}`}
                label={c.title}
                hint={c.summary}
                value={c.state === "open" ? "Activo" : c.outcome}
                chevron
              />
            ))}
          </ListCard>
        )}
      </section>
    </main>
  );
}
