"use client";

import { CaretRight, Check, Clock, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { acceptChallengeWithNewHabit, requestCancel, respondChallenge } from "@/app/(app)/retos/actions";
import { AcceptOptions, ProposalHabitLines } from "@/components/AcceptOptions";
import type { IconKey } from "@/domain/presets";
import { CREATE_NEW, defaultAcceptSelection } from "@/lib/challenge-accept";
import { formatCLP } from "@/domain/ledger";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Sheet } from "./ui/Sheet";

/** Static status label: icon + text, never color alone. */
export function Pill({
  tone = "field",
  icon,
  children,
}: {
  tone?: "field" | "accent";
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-[10px] py-1 text-small font-medium ${
        tone === "accent" ? "bg-accent-soft text-accent" : "bg-field text-ink"
      }`}
    >
      {icon}
      {children}
    </span>
  );
}

export const DonePill = ({ who, done }: { who: string; done: boolean }) => (
  <Pill tone={done ? "accent" : "field"} icon={done ? <Check size={14} weight="light" aria-hidden /> : <Clock size={14} weight="light" aria-hidden />}>
    {who}: {done ? "hecho" : "pendiente"}
  </Pill>
);

function ErrorLine({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-[6px] text-small text-ink">
      <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
      {message}
    </p>
  );
}

export function ProgressRow({ label, value, target, you }: { label: string; value: number; target: number; you?: boolean }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="flex items-center gap-2 text-small">
        <p className="flex-1 text-ink">{label}</p>
        <p className="text-muted">
          {value} de {target}
        </p>
      </div>
      <div className="h-[6px] overflow-hidden rounded-full bg-ink-soft">
        <div
          className={`h-[6px] rounded-[3px] ${you ? "bg-accent" : "bg-outline-strong"}`}
          style={{ width: `${pct}%`, minWidth: value > 0 ? undefined : 2 }}
        />
      </div>
    </div>
  );
}

export type HabitChoice = { id: string; name: string; requiresPhoto: boolean };

export type ChallengeCardData = {
  id: string;
  kind: "incoming" | "outgoing" | "active" | "finished";
  otherName: string;
  /** Rival's uploaded photo URL and bundled preset (the avatar shown on proposal cards). */
  otherAvatar?: string | null;
  otherPreset?: number | null;
  habitName: string;
  summary: string;
  fine: number;
  requiresPhoto: boolean;
  /** Active: progress per player in the current period (weekly) or today's state (daily). */
  progress?:
    | { type: "weekly"; target: number; you: number; them: number }
    | { type: "daily"; youDone: boolean; themDone: boolean };
  /** Finished: outcome label ("Ganaste", "Perdiste", "Empate", "Cancelado"). */
  outcome?: string;
  habits?: HabitChoice[];
  /** Proposals: the proposer habit as it is shown (icon, kind of record) and the "Crear" option. */
  habitIcon?: IconKey;
  habitKind?: string;
  createSubline?: string;
  /** The new habit cannot keep the proposer log type: it is created as "Solo marcar". */
  createSimple?: boolean;
  /** false when the proposer habit could not be read: "Crear" is not offered. */
  sourceReadable?: boolean;
};

export function ChallengeCard({ data }: { data: ChallengeCardData }) {
  if (data.kind === "incoming") return <IncomingCard data={data} />;
  if (data.kind === "outgoing") return <OutgoingCard data={data} />;
  if (data.kind === "active") return <ActiveCard data={data} />;
  return (
    <Link href={`/retos/${data.id}`} className="block">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <p className="truncate text-body font-medium text-ink">
              {data.habitName} con {data.otherName}
            </p>
            <p className="truncate text-small text-muted">{data.summary}</p>
          </div>
          <p className="shrink-0 text-small text-accent">{data.outcome}</p>
        </div>
      </Card>
    </Link>
  );
}

function ActiveCard({ data }: { data: ChallengeCardData }) {
  const p = data.progress;
  return (
    <Link href={`/retos/${data.id}`} className="block">
      <Card accent={p?.type === "weekly"} className="flex flex-col gap-3 p-4 pl-[19px]">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <p className="truncate text-[17px] font-semibold leading-[1.3] tracking-[-0.02em] text-ink">
              {data.habitName} con {data.otherName}
            </p>
            <p className="truncate text-small text-muted">{data.summary}</p>
          </div>
          <CaretRight size={20} weight="light" className="shrink-0 text-muted" aria-hidden />
        </div>
        {p?.type === "weekly" ? (
          <>
            <ProgressRow label="Tú" value={p.you} target={p.target} you />
            <ProgressRow label={data.otherName} value={p.them} target={p.target} />
          </>
        ) : p?.type === "daily" ? (
          <div className="flex flex-wrap gap-2">
            <DonePill who="Tú" done={p.youDone} />
            <DonePill who={data.otherName} done={p.themDone} />
          </div>
        ) : null}
      </Card>
    </Link>
  );
}

function IncomingCard({ data }: { data: ChallengeCardData }) {
  const [sheet, setSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  const choices = (data.habits ?? []).filter((h) => !data.requiresPhoto || h.requiresPhoto);
  const readable = data.sourceReadable ?? true;
  const initial = readable
    ? defaultAcceptSelection(data.habitName, choices)
    : { selected: choices[0]?.id ?? "", canCreate: false };
  const [choice, setChoice] = useState<string>(initial.selected);

  function decline() {
    start(async () => {
      setError(null);
      const r = await respondChallenge(data.id, false);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }
  function accept() {
    start(async () => {
      setError(null);
      const r =
        choice === CREATE_NEW && initial.canCreate
          ? await acceptChallengeWithNewHabit(data.id)
          : await respondChallenge(data.id, true, choice);
      if (r.ok) {
        setSheet(false);
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <Avatar name={data.otherName} src={data.otherAvatar} preset={data.otherPreset} />
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <p className="text-body font-medium text-ink">{data.otherName} te propone un reto</p>
          <ProposalSummary data={data} />
        </div>
      </div>
      <div className="flex items-center gap-2 text-small">
        <p className="flex-1 text-muted">Multa por falla</p>
        <p className="font-mono text-[15px] font-medium text-ink">{formatCLP(data.fine)}</p>
      </div>
      {error && !sheet ? <ErrorLine message={error} /> : null}
      <div className="flex gap-2">
        <Button variant="secondary" disabled={busy} onClick={decline}>
          Rechazar
        </Button>
        <Button disabled={busy} onClick={() => setSheet(true)}>
          Aceptar
        </Button>
      </div>
      <Sheet open={sheet} title="Elige tu hábito" onClose={() => setSheet(false)}>
        <AcceptOptions
          otherName={data.otherName}
          proposedName={data.habitName}
          createSubline={data.createSubline ?? ""}
          createSimple={data.createSimple ?? false}
          habits={choices}
          canCreate={initial.canCreate}
          sourceReadable={readable}
          selected={choice}
          onSelect={setChoice}
        />
        {error ? <ErrorLine message={error} /> : null}
        <Button disabled={busy || !choice} onClick={accept}>
          Aceptar reto
        </Button>
        <Button variant="ghost" onClick={() => setSheet(false)}>
          Cancelar
        </Button>
      </Sheet>
    </Card>
  );
}

/** Proposal lines: icon + habit · frequency · weeks, then the kind of record (and "Con foto"). */
function ProposalSummary({ data }: { data: ChallengeCardData }) {
  return (
    <ProposalHabitLines
      icon={data.habitIcon ?? "target"}
      name={data.habitName}
      summary={data.summary}
      kind={data.habitKind ?? "Solo marcar"}
      requiresPhoto={data.requiresPhoto}
    />
  );
}

function OutgoingCard({ data }: { data: ChallengeCardData }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <Avatar name={data.otherName} src={data.otherAvatar} preset={data.otherPreset} />
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <p className="text-body font-medium text-ink">Esperando a {data.otherName}</p>
          <ProposalSummary data={data} />
        </div>
      </div>
      {error ? <ErrorLine message={error} /> : null}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await requestCancel(data.id);
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
      >
        Cancelar propuesta
      </Button>
    </Card>
  );
}

/** Mutual cancel of an active challenge: the second request ends it. */
export function CancelChallengeButton({
  id,
  otherName,
  requestedByMe,
  requestedByOther,
}: {
  id: string;
  otherName: string;
  requestedByMe: boolean;
  requestedByOther: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(requestedByMe);
  const [busy, start] = useTransition();
  const router = useRouter();

  if (asked) {
    return (
      <p className="text-small text-muted">Pediste cancelar el reto. Falta que {otherName} lo confirme.</p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {requestedByOther ? (
        <p className="text-small text-muted">{otherName} pidió cancelar el reto.</p>
      ) : null}
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => {
          const msg = requestedByOther
            ? `¿Cancelar el reto con ${otherName}?`
            : `¿Pedir a ${otherName} cancelar el reto? Se cancela cuando los dos lo confirmen.`;
          if (!window.confirm(msg)) return;
          start(async () => {
            setError(null);
            const r = await requestCancel(id);
            if (!r.ok) return setError(r.error);
            if (!r.cancelled) setAsked(true);
            router.refresh();
          });
        }}
      >
        {requestedByOther ? "Confirmar cancelación" : "Pedir cancelar el reto"}
      </Button>
      {error ? <ErrorLine message={error} /> : null}
    </div>
  );
}
