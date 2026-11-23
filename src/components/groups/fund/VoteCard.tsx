"use client";

/**
 * VoteCard: an open fine proposal and the caller's vote.
 * Props: `proposal: GroupFineProposal`, `canVote` (false in an archived group: read-only, no
 * buttons), `pending` (the vote request is running), `error` (server error or null),
 * `onVote(accept)`, `now` (page clock, epoch ms: past `expiresAt` the card says "La votación terminó."
 * and has no buttons). Before voting: "Aceptar" / "No participar"; after: the status and "Cambiar".
 * Both states have the same control height, so a vote never moves the card.
 */
import { Check } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatCLP } from "@/domain/ledger";
import type { GroupFineProposal } from "@/lib/groups-fines-contract";
import { ErrorLine, Mono } from "../detail/parts";
import { acceptedLine, proposalExpired, voteStatus } from "./fund-logic";

export function VoteCard({
  proposal,
  canVote,
  pending,
  error,
  onVote,
  now,
}: {
  proposal: GroupFineProposal;
  canVote: boolean;
  pending: boolean;
  error: string | null;
  onVote: (accept: boolean) => void;
  /** The page's clock (epoch ms): a proposal past `expiresAt` shows "La votación terminó." and no buttons. */
  now: number;
}) {
  const [changing, setChanging] = useState(false);
  const status = voteStatus(proposal.myVote);
  const closed = proposalExpired(proposal, now);
  const choosing = status === null || changing;

  function vote(accept: boolean) {
    onVote(accept);
    setChanging(false);
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-body font-medium text-pretty text-ink">
          {proposal.proposedByName} propone una multa de <Mono>{formatCLP(proposal.amount)}</Mono> por semana incumplida
        </p>
        <p className="text-small text-muted">Fondo: {proposal.purpose}</p>
        <p className="font-mono text-small text-ink">{acceptedLine(proposal)}</p>
      </div>
      {closed ? (
        <p role="status" className="min-h-12 text-body font-medium text-ink">
          La votación terminó.
        </p>
      ) : canVote ? (
        choosing ? (
          <div className="grid min-h-12 grid-cols-2 gap-2">
            <Button disabled={pending} aria-busy={pending} onClick={() => vote(true)} className="min-w-0 px-3!">
              Aceptar
            </Button>
            <Button variant="secondary" disabled={pending} aria-busy={pending} onClick={() => vote(false)} className="min-w-0 px-3!">
              No participar
            </Button>
          </div>
        ) : (
          <div className="flex min-h-12 items-center gap-2">
            <p className="flex min-w-0 flex-1 items-center gap-1.5 text-body font-medium text-ink">
              {proposal.myVote ? <Check size={20} weight="light" className="shrink-0" aria-hidden /> : null}
              <span className="truncate">{status}</span>
            </p>
            <Button variant="ghost" disabled={pending} aria-busy={pending} onClick={() => setChanging(true)} className="w-auto! shrink-0">
              Cambiar
            </Button>
          </div>
        )
      ) : status ? (
        <p className="min-h-12 text-body font-medium text-ink">{status}</p>
      ) : null}
      {error ? <ErrorLine>{error}</ErrorLine> : null}
    </Card>
  );
}
