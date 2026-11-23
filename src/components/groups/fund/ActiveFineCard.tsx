"use client";

/**
 * ActiveFineCard: the fine in force and the caller's part in it.
 * Props: `active: GroupFineActive`, `canChange` (false in an archived group: read-only, no
 * buttons), `canEnd` (admin of a live group: "Terminar multa"), `pending` (a request is running),
 * `error` (server error or null), `onAccept`, `onStepOut`, `onEnd` (the parent owns the confirmations).
 * Bound: "Participas desde el lunes <fecha>" and "Dejar de participar"; not bound: "No participas"
 * and "Sumarme desde el próximo lunes". An ended or scheduled-exit fine shows its date instead of
 * controls that would only fail.
 */
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatCLP } from "@/domain/ledger";
import { dayMonthLabel } from "@/lib/challenge-view";
import type { GroupFineActive } from "@/lib/groups-fines-contract";
import { ErrorLine, Mono } from "../detail/parts";
import { participationLine } from "./fund-logic";

const DANGER = "border-alert! text-alert-text! hover:bg-alert-soft!";

export function ActiveFineCard({
  active,
  canChange,
  canEnd,
  pending,
  error,
  onAccept,
  onStepOut,
  onEnd,
}: {
  active: GroupFineActive;
  canChange: boolean;
  canEnd: boolean;
  pending: boolean;
  error: string | null;
  onAccept: () => void;
  onStepOut: () => void;
  onEnd: () => void;
}) {
  const ending = active.endsOn !== null;
  const leaving = active.iAmBound && active.myBoundUntil !== null;
  const showAccept = canChange && !active.iAmBound && !ending;
  const showStepOut = canChange && active.iAmBound && !leaving;
  const showEnd = canChange && canEnd && !ending;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-body font-medium text-pretty text-ink">
          Multa activa: <Mono>{formatCLP(active.amount)}</Mono> por semana incumplida
        </p>
        <p className="text-small text-muted">Fondo: {active.purpose}</p>
        <p className="text-small text-ink">
          Participan <Mono>{active.boundCount}</Mono>
        </p>
        <p className="text-small font-medium text-ink">{participationLine(active)}</p>
        {ending && active.endsOn ? (
          <p className="text-small text-muted">La multa termina el lunes {dayMonthLabel(active.endsOn)}.</p>
        ) : null}
      </div>
      {showAccept ? (
        <Button disabled={pending} aria-busy={pending} onClick={onAccept}>
          Sumarme desde el próximo lunes
        </Button>
      ) : null}
      {showStepOut ? (
        <Button variant="secondary" disabled={pending} aria-busy={pending} onClick={onStepOut}>
          Dejar de participar
        </Button>
      ) : null}
      {showEnd ? (
        <Button variant="secondary" className={DANGER} disabled={pending} aria-busy={pending} onClick={onEnd}>
          Terminar multa
        </Button>
      ) : null}
      {error ? <ErrorLine>{error}</ErrorLine> : null}
    </Card>
  );
}
