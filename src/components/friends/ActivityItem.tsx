import { Clock, Fire, ImageBroken, Prohibit } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { groupByDay, type FeedEntry } from "@/lib/feed";

const profileHref = (username: string) => `/@${username}`;

/** Status chip: icon + words, never color alone. */
function StatusChip({ status }: { status: FeedEntry["status"] }) {
  if (!status) return null;
  if (status.kind === "rejected") {
    return (
      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-alert-soft px-2.5 text-small font-medium text-ink">
        <Prohibit size={14} weight="light" aria-hidden className="text-alert-text" />
        {status.byMe ? "La rechazaste" : "Rechazada"}
      </span>
    );
  }
  return (
    <Link
      href={`/retos/${status.challengeId}`}
      className="-my-2 inline-flex min-h-11 items-center rounded-full focus-visible:outline-offset-0"
    >
      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-field px-2.5 text-small font-medium text-ink">
        <Clock size={14} weight="light" aria-hidden />
        Se aprueba sola en {status.hours} h
      </span>
    </Link>
  );
}

function StreakLine({ streak }: { streak: NonNullable<FeedEntry["streak"]> }) {
  if (streak.milestone) {
    return (
      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-(--habit-soft) px-2.5 text-small font-medium text-ink ring-1 ring-inset ring-(--habit)">
        <Fire size={14} weight="light" aria-hidden />
        {streak.text}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-small text-muted">
      <Fire size={14} weight="light" aria-hidden />
      {streak.text}
    </span>
  );
}

/** Proof photo: dark media surface in both themes, white title over a scrim. */
function PhotoCard({ entry }: { entry: FeedEntry }) {
  return (
    <div className="relative mt-1 flex h-[208px] flex-col justify-end overflow-hidden rounded-md bg-media p-3.5">
      {entry.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
        <img src={entry.photoUrl} alt={`Foto de ${entry.habit.name}`} className="absolute inset-0 size-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center gap-1.5 pb-8 text-small text-on-media/80">
          <ImageBroken size={18} weight="light" aria-hidden />
          Foto no disponible
        </span>
      )}
      <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent from-45% to-media/80" />
      <p className="relative text-[17px] font-semibold leading-[1.3] tracking-[-0.02em] text-on-media">{entry.copy}</p>
    </div>
  );
}

/**
 * One friend check-in: who (avatar and name open their profile), the habit with its identity
 * color, what happened, when, and the streak or review status when it matters.
 * `showPerson={false}` on the friend's own profile, where the person is already the page.
 */
export function ActivityItem({ entry, showPerson = true }: { entry: FeedEntry; showPerson?: boolean }) {
  const href = profileHref(entry.person.username);
  const hasMeta = Boolean(entry.streak || entry.status);
  return (
    <li className="flex gap-3 px-4 py-3.5" data-habit-color={entry.habit.color}>
      {showPerson ? (
        <Link href={href} tabIndex={-1} aria-hidden className="-m-0.5 flex size-11 shrink-0 items-center justify-center self-start rounded-full">
          <Avatar name={entry.person.name} src={entry.person.avatar} />
        </Link>
      ) : null}
      <article className="flex min-w-0 flex-1 flex-col gap-1.5" aria-label={`${entry.person.name}: ${entry.copy}`}>
        <div className="flex min-h-6 items-center gap-2">
          {showPerson ? (
            <Link
              href={href}
              className="-my-2.5 inline-flex min-h-11 min-w-0 items-center truncate text-body font-medium text-ink hover:underline"
            >
              <span className="truncate">{entry.person.name}</span>
            </Link>
          ) : (
            <span className="flex min-w-0 items-center gap-2 text-body text-ink">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-(--habit)" />
              <span className="truncate">{entry.hasPhoto ? entry.habit.name : entry.copy}</span>
            </span>
          )}
          <time className="ml-auto shrink-0 font-mono text-[12px] font-medium tracking-[0.04em] text-muted">
            {entry.time}
          </time>
        </div>
        {entry.hasPhoto ? (
          <PhotoCard entry={entry} />
        ) : showPerson ? (
          <p className="flex min-w-0 items-center gap-2 text-body text-ink">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-(--habit)" />
            <span className="min-w-0 break-words">{entry.copy}</span>
          </p>
        ) : null}
        {hasMeta ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">
            {entry.streak ? <StreakLine streak={entry.streak} /> : null}
            <StatusChip status={entry.status} />
          </div>
        ) : null}
      </article>
    </li>
  );
}

/**
 * Check-ins grouped by day: a mono caps label ("Hoy", "Ayer", "lun 20 nov") over one card of
 * rows. A group that continues the previous page's day skips the label.
 */
export function ActivityDays({
  items,
  today,
  continuesFrom = null,
  showPerson = true,
}: {
  items: FeedEntry[];
  today: string;
  continuesFrom?: string | null;
  showPerson?: boolean;
}) {
  return groupByDay(items, today, continuesFrom).map((g) => (
    <section key={`${g.date}-${g.items[0].id}`} aria-label={g.label} className="flex flex-col gap-2">
      {g.continued ? null : <h3 className="section-label flex h-6 items-center pt-1 text-muted">{g.label}</h3>}
      <Card>
        <ul className="divide-y divide-line">
          {g.items.map((e) => (
            <ActivityItem key={e.id} entry={e} showPerson={showPerson} />
          ))}
        </ul>
      </Card>
    </section>
  ));
}
