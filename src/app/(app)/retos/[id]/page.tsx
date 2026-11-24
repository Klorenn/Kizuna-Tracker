import { CaretLeft, Check, CheckCircle, Clock, Warning } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CatJump } from "@/components/brand/CatJump";
import { CancelChallengeButton, Pill } from "@/components/ChallengeCard";
import { FeedItem } from "@/components/FeedItem";
import { RejectPhotoButton } from "@/components/RejectSheet";
import { Avatar } from "@/components/ui/Avatar";
import { avatarUrl } from "@/lib/avatar";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { canReject, periodsFor, REJECT_WINDOW_MS } from "@/domain/challenges";
import { localDate } from "@/domain/dates";
import { toHabitColor, type HabitColor } from "@/domain/habit-colors";
import { formatCLP, netBalances } from "@/domain/ledger";
import { REJECT_LABEL, type RejectReason } from "@/lib/challenge-form";
import {
  challengeFrequency,
  countingDates,
  cancelledLabel,
  dayMonthLabel,
  endsOn,
  failureHistory,
  firstName,
  frequencyLabel,
  itemNamesOf,
  itemProgress,
  itemViews,
  periodStatus,
  subRetosLabel,
  weekdayLabel,
  type ItemResultRow,
  type ItemRow,
} from "@/lib/challenge-view";
import { fetchAll } from "@/lib/paginate";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { itemHabitIds } from "@/lib/retos-cards";
import { untypedDb } from "@/lib/untyped-db";

type ChallengeRow = Database["public"]["Tables"]["challenges"]["Row"] & { challenge_items: ItemRow[] | null };
const ITEM_COLUMNS = "id,position,status,creator_habit_id,rival_habit_id,target_per_week,requires_photo,proposed_by,starts_on";

export const metadata: Metadata = { title: "Reto" };

const SIGNED_SECONDS = 300;

/** Period progress in the player's habit color (empty segments stay neutral). */
function Segments({ done, total, color }: { done: number; total: number; color: HabitColor }) {
  return (
    <div className="flex gap-[6px]" data-habit-color={color}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-[6px] flex-1 rounded-[3px] ${i < done ? "bg-(--habit)" : "bg-ink-soft"}`} />
      ))}
    </div>
  );
}

export default async function RetoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/bienvenida");

  // the sub-retos come embedded: one read, no extra round trip before the parallel batch
  const { data: row } = await untypedDb(supabase) // TODO(sub-retos types)
    .from("challenges")
    .select(`*,challenge_items(${ITEM_COLUMNS})`)
    .eq("id", id)
    .maybeSingle();
  const c = row as ChallengeRow | null;
  if (!c) notFound();
  if (c.status === "proposed" || c.status === "declined") redirect("/retos");

  const mine = c.creator_id === user.id;
  const otherId = mine ? c.rival_id : c.creator_id;
  const allItems = c.challenge_items ?? [];
  // live sub-retos (proposed or active), position order, habits oriented to the viewer
  const views = itemViews(allItems, c, user.id);
  const active = views.filter((v) => v.status === "active");
  const pending = views.filter((v) => v.status === "proposed");
  // the first one mirrors the legacy columns: it names the challenge and feeds the legacy history text
  const first = views[0];
  const myHabitId = first ? first.myHabitId : mine ? c.creator_habit_id : c.rival_habit_id;
  const theirHabitId = first ? first.theirHabitId : mine ? c.rival_habit_id : c.creator_habit_id;
  const habitIds = [
    ...new Set([
      ...[c.creator_habit_id, c.rival_habit_id].filter((x): x is string => !!x),
      ...itemHabitIds(allItems),
    ]),
  ];

  const [{ data: profile }, { data: habits }, { data: checkins }, { data: debts }, { data: closed }, { data: friends }, { data: me }, itemResults] =
    await Promise.all([
      supabase.from("public_profiles").select("display_name,avatar_path,avatar_preset").eq("id", otherId).maybeSingle(),
      supabase.from("habits").select("id,name,color").in("id", habitIds),
      c.starts_on
        ? supabase
            .from("checkins")
            .select("id,habit_id,local_date,photo_path,is_duplicate,rejected_at,rejected_by,reject_reason,created_at")
            .in("habit_id", habitIds)
            .gte("local_date", c.starts_on)
            .lte("local_date", endsOn(c) ?? c.starts_on)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase.from("debts").select("id,debtor_id,creditor_id,amount,paid_at,period_start").eq("challenge_id", c.id),
      supabase.from("challenge_periods").select("period_start").eq("challenge_id", c.id).not("closed_at", "is", null),
      // the rival's check-ins are only readable while we are friends
      supabase.rpc("is_friend", { a: user.id, b: otherId }),
      supabase.from("profiles").select("avatar_path,avatar_updated_at,avatar_preset").eq("id", user.id).maybeSingle(),
      // per sub-reto outcomes of closed periods (none for periods closed before sub-retos: legacy text)
      fetchAll<unknown>((from, to) =>
        untypedDb(supabase) // TODO(sub-retos types)
          .from("challenge_item_results")
          .select("period_start,item_id,player_id,met")
          .eq("challenge_id", id)
          .order("period_start")
          .order("item_id")
          .order("player_id")
          .range(from, to),
      ).then((rows) => rows as ItemResultRow[], (): ItemResultRow[] => []),
    ]);

  const other = firstName(profile?.display_name);
  const habitRow = (habitId: string | null) => (habits ?? []).find((h) => h.id === habitId);
  const myHabitName = habitRow(myHabitId)?.name ?? "Hábito";
  const theirHabitName = habitRow(theirHabitId)?.name ?? myHabitName;
  const f = challengeFrequency(c);
  const now = new Date();
  const today = localDate(now, c.timezone);
  const st = periodStatus(c, today);
  const rows = checkins ?? [];
  // same rule as the close-periods cron, per sub-reto: from its start, and a photo sub-reto only counts photos
  const datesFor = (habitId: string | null, v: { requiresPhoto: boolean; startsOn: string | null }) =>
    habitId ? countingDates(rows, habitId, v.requiresPhoto, v.startsOn) : [];
  const itemFreq = c.frequency_type === "weekly" ? "weekly" : "daily";
  const bars = active.map((v) => {
    const mineDates = datesFor(v.myHabitId, v);
    const theirDates = datesFor(v.theirHabitId, v);
    return {
      v,
      myName: habitRow(v.myHabitId)?.name ?? "Hábito",
      theirName: habitRow(v.theirHabitId)?.name ?? "Hábito",
      myColor: toHabitColor(habitRow(v.myHabitId)?.color),
      theirColor: toHabitColor(habitRow(v.theirHabitId)?.color),
      mineDates,
      theirDates,
      progress:
        st.state === "running"
          ? itemProgress(v, itemFreq, st.period, (h) => (h === v.myHabitId ? mineDates : theirDates))
          : null,
    };
  });
  // legacy history text (periods without item results) speaks of the first sub-reto
  const firstBars = bars.find((b) => b.v.id === first?.id);
  const myDates = firstBars?.mineDates ?? [];
  const theirDates = firstBars?.theirDates ?? [];
  const moreLabel = subRetosLabel(views.length);

  const subtitle = [
    st.state === "running"
      ? f.type === "weekly"
        ? `Semana ${st.index} de ${st.total}`
        : `Día ${st.index} de ${st.total}`
      : st.state === "pending"
        ? `Empieza el ${c.starts_on ? weekdayLabel(c.starts_on) : ""}`
        : "Período final",
    frequencyLabel(f).toLowerCase(),
    `multa ${formatCLP(c.fine_amount)}`,
  ].join(" · ");

  // photos
  const photoBars = bars.filter((b) => b.v.requiresPhoto);
  const hasPhotos = photoBars.length > 0;
  const myItemHabits = new Set(bars.flatMap((b) => (b.v.myHabitId ? [b.v.myHabitId] : [])));
  const rejectedMine = rows.filter((k) => myItemHabits.has(k.habit_id) && k.rejected_at);
  // per-challenge counters: photos each player rejected, inside the challenge dates
  const rejectedByMe = rows.filter((k) => k.rejected_at && k.rejected_by === user.id).length;
  const rejectedByOther = rows.filter((k) => k.rejected_at && k.rejected_by === otherId).length;
  // their photos on any photo sub-reto (newest first, from the read), from the sub-reto start
  const theirPhotos = rows.filter(
    (k) =>
      !k.rejected_at &&
      k.photo_path &&
      photoBars.some((b) => b.v.theirHabitId === k.habit_id && k.local_date >= (b.v.startsOn ?? "")),
  );
  const inWindow = theirPhotos.filter((k) => canReject(new Date(k.created_at), now)).slice(0, 5);
  const shown = hasPhotos ? (inWindow.length > 0 ? inWindow : theirPhotos.slice(0, 1)) : [];
  const paths = shown.flatMap((k) => (k.photo_path ? [k.photo_path] : []));
  const signed = paths.length
    ? await supabase.storage.from("proofs").createSignedUrls(paths, SIGNED_SECONDS)
    : { data: [] };
  const urlByPath = new Map(
    (signed.data ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])),
  );
  const timeFmt = new Intl.DateTimeFormat("es-CL", {
    timeZone: c.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const when = (iso: string) => {
    const d = localDate(new Date(iso), c.timezone);
    const day = d === today ? "hoy" : dayMonthLabel(d);
    return `${day} ${timeFmt.format(new Date(iso))}`;
  };

  // money
  const ledger = (debts ?? []).map((d) => ({
    id: d.id,
    debtorId: d.debtor_id,
    creditorId: d.creditor_id,
    amount: d.amount,
    paidAt: d.paid_at,
  }));
  const balance = netBalances(ledger, user.id).get(otherId) ?? 0;
  const balanceCaption = balance > 0 ? `${other} te debe` : balance < 0 ? `Le debes a ${other}` : "Sin deudas";

  // failure history: from the ledger, which both players can always read (check-ins cannot)
  const history = failureHistory({
    periods: c.starts_on ? periodsFor(c.starts_on, c.weeks, f) : [],
    closedStarts: (closed ?? []).map((p) => p.period_start),
    debts: debts ?? [],
    myId: user.id,
    otherName: other,
    frequency: f,
    myDates,
    theirDates: friends === true ? theirDates : null,
    itemResults,
    itemNames: itemNamesOf(allItems, mine, (h) => habitRow(h)?.name),
  });
  const label = f.type === "weekly" ? "Semana" : "Día";
  // same outcome rule as the Retos list: the viewer won when the rival owes more than they do
  const iOwe = (debts ?? []).filter((d) => d.debtor_id === user.id).reduce((n, d) => n + d.amount, 0);
  const theyOwe = (debts ?? []).filter((d) => d.creditor_id === user.id).reduce((n, d) => n + d.amount, 0);
  const iWon = c.status === "finished" && theyOwe > iOwe;

  const closesLabel = st.state === "running" ? (f.type === "weekly" ? `Cierra ${weekdayLabel(st.period.end).split(" ")[0]} 23:59` : "Cierra hoy 23:59") : undefined;
  const statusPill =
    c.status === "active" ? (
      <Pill tone="accent" icon={<Check size={14} weight="light" aria-hidden />}>
        Activo
      </Pill>
    ) : (
      <Pill icon={<Clock size={14} weight="light" aria-hidden />}>{c.status === "finished" ? "Terminado" : cancelledLabel(c)}</Pill>
    );

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-6 pt-1">
      <Link href="/retos" className="flex h-11 items-center gap-1 text-[17px] text-accent">
        <CaretLeft size={20} weight="light" aria-hidden />
        Retos
      </Link>
      <h1 className="text-display font-semibold text-ink">
        {myHabitName} con {other}
        {moreLabel ? <span className="text-muted"> {moreLabel}</span> : null}
      </h1>
      <div className="flex items-center gap-2">
        {statusPill}
        <p className="flex-1 text-small text-muted">{subtitle}</p>
      </div>
      {iWon ? (
        <p className="flex items-center gap-2 text-body font-medium text-ink">
          <CatJump width={48} once />
          Ganaste este reto
        </p>
      ) : null}

      <SectionHeader label={f.type === "weekly" ? "Esta semana" : "Hoy"} action={closesLabel} />
      <Card accent className="flex flex-col gap-5 p-4 pl-[19px]">
        {bars.map(({ v, myName, theirName, myColor: mc, theirColor: tc, progress }) => (
          <div key={v.id} className="flex flex-col gap-4">
            {bars.length > 1 ? (
              <p className="text-small font-medium text-ink">
                {myName === theirName ? myName : `${myName} · ${theirName}`}
              </p>
            ) : null}
            {progress === null && v.startsOn && v.startsOn > today ? (
              <p className="text-small text-muted">Empieza el {weekdayLabel(v.startsOn)}</p>
            ) : (
              [
                {
                  name: "Tú",
                  done: progress?.type === "weekly" ? progress.you : progress?.youDone ? 1 : 0,
                  color: mc,
                  src: avatarUrl(me?.avatar_path ?? null, me?.avatar_updated_at),
                  preset: me?.avatar_preset,
                },
                {
                  name: other,
                  done: progress?.type === "weekly" ? progress.them : progress?.themDone ? 1 : 0,
                  color: tc,
                  src: avatarUrl(profile?.avatar_path ?? null),
                  preset: profile?.avatar_preset,
                },
              ].map((row) => (
                <div key={row.name} className="flex items-center gap-3">
                  <Avatar name={row.name} src={row.src} preset={row.preset} />
                  <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-body font-medium text-ink">{row.name}</p>
                      <p className="text-small text-muted">
                        {row.done} de {progress?.type === "weekly" ? progress.target : 1}
                      </p>
                    </div>
                    <Segments done={row.done} total={progress?.type === "weekly" ? progress.target : 1} color={row.color} />
                  </div>
                </div>
              ))
            )}
          </div>
        ))}
        {bars.length === 0 ? <p className="text-small text-muted">Sin sub-retos activos.</p> : null}
      </Card>

      {pending.length > 0 ? (
        <>
          <SectionHeader label="Sub-retos pendientes" />
          <Card className="divide-y divide-line px-4">
            {pending.map((v) => {
              const name = habitRow(v.myHabitId ?? v.theirHabitId)?.name ?? "Hábito";
              return (
                <p key={v.id} className="py-3 text-body text-ink">
                  {name}
                  <span className="text-small text-muted">
                    {" "}
                    · {v.pendingFor === "me" ? `${other} lo propone` : `esperando a ${other}`}
                  </span>
                </p>
              );
            })}
          </Card>
        </>
      ) : null}
      {c.status === "active" ? (
        <Link href={`/retos/nuevo?reto=${c.id}`} className="text-small text-accent">
          Agregar sub-reto
        </Link>
      ) : null}

      {hasPhotos && c.status === "active" ? (
        <>
          <SectionHeader
            label={`${inWindow.length > 1 ? "Fotos" : "Última foto"} de ${other}`}
            action={inWindow.length > 0 ? "Pendiente" : undefined}
          />
          {shown.length === 0 ? (
            <Card className="p-4">
              <p className="text-body text-muted">{other} aún no sube fotos en este reto.</p>
            </Card>
          ) : (
            shown.map((k) => {
              const left = Math.ceil((new Date(k.created_at).getTime() + REJECT_WINDOW_MS - now.getTime()) / 3_600_000);
              const rejectable = canReject(new Date(k.created_at), now);
              return (
                <div key={k.id} className="flex flex-col gap-3">
                  <FeedItem
                    entry={{
                      id: k.id,
                      who: habitRow(k.habit_id)?.name ?? theirHabitName,
                      habit: when(k.created_at),
                      icon: "target",
                      when: "",
                      photoUrl: k.photo_path ? (urlByPath.get(k.photo_path) ?? null) : null,
                      note: rejectable ? `Puedes rechazarla durante ${left} h más` : null,
                    }}
                  />
                  {k.is_duplicate ? (
                    <p className="flex items-center gap-2 text-small text-ink">
                      <Warning size={16} weight="light" className="shrink-0 text-alert" aria-hidden />
                      Foto repetida
                    </p>
                  ) : null}
                  {rejectable ? (
                    <RejectPhotoButton checkinId={k.id} ownerName={other} rejectedCount={rejectedByMe} />
                  ) : null}
                </div>
              );
            })
          )}
        </>
      ) : null}

      <SectionHeader label="Saldo del reto" />
      <div className="flex gap-3">
        <Card className="flex flex-1 flex-col gap-1 p-4">
          <p className="text-small text-muted">Total adeudado</p>
          <p className="text-title font-semibold text-ink">{formatCLP(Math.abs(balance))}</p>
          <p className="text-small text-muted">{balanceCaption}</p>
        </Card>
        {hasPhotos ? (
          <Card className="flex flex-1 flex-col gap-1 p-4">
            <p className="text-small text-muted">Fotos rechazadas</p>
            <p className="text-title font-semibold text-ink">{rejectedByMe + rejectedByOther}</p>
            <p className="text-small text-muted">
              Tú {rejectedByMe} · {other} {rejectedByOther}
            </p>
          </Card>
        ) : null}
      </div>
      <Link href="/deudas" className="text-small text-accent">
        Ver deudas
      </Link>

      {rejectedMine.length > 0 ? (
        <>
          <SectionHeader label="Tus fotos rechazadas" />
          <Card className="divide-y divide-line px-4">
            {rejectedMine.map((k) => (
              <div key={k.id} className="flex flex-col gap-[2px] py-3">
                <p className="text-body font-medium text-ink">
                  {REJECT_LABEL[k.reject_reason as RejectReason] ?? "Otro"}
                </p>
                <p className="text-small text-muted">
                  Foto de {dayMonthLabel(k.local_date)} · no cuenta para el reto
                </p>
              </div>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader label="Historial de fallas" />
      <Card className="divide-y divide-line px-4 py-1">
        {history.length === 0 ? (
          <p className="py-3 text-body text-muted">Aún no hay períodos cerrados.</p>
        ) : (
          history.map(({ start, n, summary, debt }) => (
            <div key={start} className="flex items-center gap-3 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <p className="text-body font-medium text-ink">
                  {label} {n}
                </p>
                <p className="text-small text-muted">{summary}</p>
              </div>
              {debt ? (
                <>
                  <p className="font-mono text-[15px] font-medium text-ink">{formatCLP(debt.amount)}</p>
                  <Pill
                    icon={
                      debt.paid ? (
                        <CheckCircle size={14} weight="light" aria-hidden />
                      ) : (
                        <Clock size={14} weight="light" aria-hidden />
                      )
                    }
                  >
                    {debt.paid ? "Pagada" : "Pendiente"}
                  </Pill>
                </>
              ) : null}
            </div>
          ))
        )}
      </Card>

      {c.status === "active" ? (
        <CancelChallengeButton
          id={c.id}
          otherName={other}
          requestedByMe={c.cancel_requested_by === user.id}
          requestedByOther={Boolean(c.cancel_requested_by) && c.cancel_requested_by !== user.id}
        />
      ) : null}
    </main>
  );
}
