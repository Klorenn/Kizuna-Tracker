"use client";

/**
 * JoinFineQuestion: the question a person who has just joined a group with a fine is asked once ("Aceptar multa" /
 * "Ahora no"). The page decides when to render it (`joinQuestionVisible`). "Ahora no" only closes the card and binds
 * nothing; "Aceptar multa" calls `acceptActive` and the fund shows the normal state on the next props. An error keeps the card.
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatCLP } from "@/domain/ledger";
import type { GroupFineActions } from "@/lib/groups-fines-contract";
import { answerJoinQuestion } from "../detail/fines-wiring";
import { createRunner } from "../detail/group-logic";
import { ErrorLine } from "../detail/parts";
import { RULE_LINE } from "./fund-logic";

export function JoinFineQuestion({
  groupId,
  amount,
  purpose,
  acceptActive,
  onAccepted,
}: {
  groupId: string;
  amount: number;
  purpose: string;
  acceptActive: GroupFineActions["acceptActive"];
  /** Called after the server accepted: the page refreshes. */
  onAccepted: () => void | Promise<void>;
}) {
  const [runner] = useState(createRunner);
  const [closed, setClosed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (closed) return null;

  async function answer(accept: boolean) {
    if (pending) return;
    setPending(true);
    setError(null);
    const r = await answerJoinQuestion({ accept, groupId, acceptActive, runner });
    setPending(false);
    if (r.kind === "error") setError(r.error);
    if (r.kind === "closed") {
      setClosed(true);
      if (accept) void onAccepted();
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="text-body text-pretty break-words text-ink">
        Este grupo tiene una multa de {formatCLP(amount)} por cada semana que no cumplas. Va al fondo: {purpose}. Solo aplica si
        la aceptas.
      </p>
      <p className="text-small text-pretty text-muted">{RULE_LINE}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={pending} aria-busy={pending} onClick={() => void answer(true)} className="min-w-0 px-3!">
          Aceptar multa
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => void answer(false)} className="min-w-0 px-3!">
          Ahora no
        </Button>
      </div>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
    </Card>
  );
}
