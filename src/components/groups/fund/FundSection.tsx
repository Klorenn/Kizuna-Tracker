"use client";

/**
 * FundSection: the whole "Fondo" section of the group detail (drop it in as a fourth section).
 *
 * Props:
 *  - `groupId: string`
 *  - `state: GroupFineState | null`, `fund: GroupFund | null` (null = that read failed: its part
 *    shows `LoadFailed`, never a $0)
 *  - `role: GroupRole`, `archived: boolean` (admin controls are absent, not disabled, for members
 *    and in an archived group, which is read-only), `myUserId: string`
 *  - `retryHref: string` (where the "Reintentar" of a failed read points: the group's page)
 *  - `actions: Pick<GroupFineActions, "propose" | "vote" | "acceptActive" | "stepOut" | "end" | "setDebtPaid">`
 *  - `onChanged?: () => void` (optional addition: called after any action the server accepted, so the
 *    page can refresh; the section already shows what was accepted until fresh props arrive)
 * Shows: the fine in force, the vote card while a proposal is open, the fund totals, who owes and the
 * recorded debts. Of each member: name, @usuario, avatar and amounts, nothing else. Every action has
 * a pending state and a single-flight guard; server errors show where the action was taken.
 * "La app solo registra. El pago se hace fuera de la app." is shown with every amount owed.
 */
import { useState } from "react";
import { LoadFailed } from "@/components/LoadFailed";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Sheet } from "@/components/ui/Sheet";
import type {
  GroupFineActions,
  GroupFineProposal,
  GroupFineState,
  GroupFund,
  GroupFundDebt,
} from "@/lib/groups-fines-contract";
import type { GroupResult, GroupRole } from "@/lib/groups-contract";
import { ConfirmBody } from "../detail/AdminSheets";
import { createRunner } from "../detail/group-logic";
import { ActiveFineCard } from "./ActiveFineCard";
import { applyDebtPaid, applyVote, canMarkPaid, RULE_LINE, runAndNotify } from "./fund-logic";
import { FundDebtRow } from "./FundDebtRow";
import { FundPeople } from "./FundPeople";
import { FundTotals } from "./FundTotals";
import { ProposalSheet } from "./ProposalSheet";
import { VoteCard } from "./VoteCard";

type Confirm = null | "stepOut" | "end";

export type FundActions = Pick<
  GroupFineActions,
  "propose" | "vote" | "acceptActive" | "stepOut" | "end" | "setDebtPaid"
>;

const CONFIRM = {
  stepOut: {
    title: "Dejar de participar",
    message: "Dejas de participar desde el próximo lunes. Las multas ya registradas se mantienen.",
  },
  end: {
    title: "Terminar multa",
    message: "La multa termina el próximo lunes. Las deudas ya registradas se mantienen.",
  },
} as const;

const subLabel = "section-label flex h-6 items-center pt-1 text-muted";

export function FundSection({
  groupId,
  state,
  fund,
  role,
  archived,
  myUserId,
  retryHref,
  actions,
  onChanged,
}: {
  groupId: string;
  state: GroupFineState | null;
  fund: GroupFund | null;
  role: GroupRole;
  archived: boolean;
  myUserId: string;
  retryHref: string;
  actions: FundActions;
  onChanged?: () => void;
}) {
  const [runner] = useState(createRunner);
  const [pending, setPending] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [proposing, setProposing] = useState(false);

  // what the server accepted, kept on top of the props until the page hands down fresh ones
  const [proposalOv, setProposalOv] = useState<GroupFineProposal | null>(null);
  const [fundOv, setFundOv] = useState<GroupFund | null>(null);
  const [seenState, setSeenState] = useState(state);
  const [seenFund, setSeenFund] = useState(fund);
  if (seenState !== state) {
    setSeenState(state);
    setProposalOv(null);
  }
  if (seenFund !== fund) {
    setSeenFund(fund);
    setFundOv(null);
  }

  const live = !archived;
  const admin = live && role === "admin";
  const proposal = state?.proposal ? (proposalOv?.id === state.proposal.id ? proposalOv : state.proposal) : null;
  const fundView = fundOv ?? fund;
  const busy = pending !== null;

  /** One request with its pending state; the failed result becomes the error of its slot. */
  async function exec<T>(slot: string, fn: () => Promise<GroupResult<T>>, onOk?: (data: T) => void) {
    if (runner.busy()) return;
    setPending(slot);
    setErrors((e) => ({ ...e, [slot]: null }));
    const r = await runAndNotify(runner, fn, (data) => {
      onOk?.(data);
      onChanged?.();
    });
    setPending(null);
    if (r && !r.ok) setErrors((e) => ({ ...e, [slot]: r.error }));
  }

  const closeConfirm = () => {
    if (!busy) setConfirm(null);
  };
  const ask = (c: Confirm) => {
    setErrors((e) => ({ ...e, active: null }));
    setConfirm(c);
  };
  const toggleDebt = (d: GroupFundDebt) => {
    const paid = d.paidAt === null;
    void exec(
      `debt:${d.debtId}`,
      () => actions.setDebtPaid(d.debtId, paid),
      () => setFundOv((f) => applyDebtPaid(f ?? fund ?? fundView!, d.debtId, paid)),
    );
  };

  const showFund =
    fundView !== null && (Boolean(state?.active) || fundView.totals.registered > 0 || fundView.debts.length > 0);

  return (
    <section aria-label="Fondo" className="flex flex-col gap-3">
      <SectionHeader label="Fondo" />

      {state === null ? (
        <LoadFailed href={retryHref} />
      ) : (
        <>
          {proposal ? (
            <VoteCard
              proposal={proposal}
              canVote={live}
              pending={busy}
              error={errors.vote ?? null}
              onVote={(accept) =>
                void exec(
                  "vote",
                  () => actions.vote(proposal.id, accept),
                  () => setProposalOv(applyVote(proposal, accept)),
                )
              }
            />
          ) : null}
          {state.active ? (
            <ActiveFineCard
              active={state.active}
              canChange={live}
              canEnd={admin}
              pending={busy}
              error={confirm ? null : (errors.active ?? null)}
              onAccept={() => void exec("active", () => actions.acceptActive(groupId))}
              onStepOut={() => ask("stepOut")}
              onEnd={() => ask("end")}
            />
          ) : null}
          {!state.active && !proposal ? (
            <Card className="p-4">
              <p className="text-body text-ink">Este grupo no tiene multa.</p>
            </Card>
          ) : null}
          {admin && !proposal ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setErrors((e) => ({ ...e, propose: null }));
                setProposing(true);
              }}
            >
              {state.active ? "Proponer cambio" : "Proponer multa"}
            </Button>
          ) : null}
        </>
      )}

      {fundView === null ? (
        <LoadFailed href={retryHref} />
      ) : showFund ? (
        <div className="flex flex-col gap-3">
          <FundTotals totals={fundView.totals} />
          {fundView.people.length > 0 ? (
            <>
              <h3 className={subLabel}>Quién debe</h3>
              <Card>
                <FundPeople people={fundView.people} />
              </Card>
            </>
          ) : null}
          {fundView.debts.length > 0 ? (
            <>
              <h3 className={subLabel}>Deudas</h3>
              <Card>
                <ul className="divide-y divide-line">
                  {fundView.debts.map((d) => (
                    <FundDebtRow
                      key={d.debtId}
                      debt={d}
                      canMark={canMarkPaid({ role, archived, debt: d, myUserId, singleAdmin: state?.singleAdmin ?? false })}
                      pending={pending === `debt:${d.debtId}`}
                      error={errors[`debt:${d.debtId}`] ?? null}
                      onToggle={toggleDebt}
                    />
                  ))}
                </ul>
              </Card>
            </>
          ) : null}
          <p className="text-small text-pretty text-muted">{RULE_LINE}</p>
        </div>
      ) : null}

      {admin && state ? (
        <ProposalSheet
          open={proposing}
          onClose={() => setProposing(false)}
          singleAdmin={state.singleAdmin}
          pending={pending === "propose"}
          error={errors.propose ?? null}
          onSubmit={(amount, purpose) =>
            void exec(
              "propose",
              () => actions.propose(groupId, amount, purpose),
              () => setProposing(false),
            )
          }
        />
      ) : null}

      {confirm ? (
        <Sheet open title={CONFIRM[confirm].title} onClose={closeConfirm}>
          <ConfirmBody
            message={CONFIRM[confirm].message}
            confirmLabel={CONFIRM[confirm].title}
            pending={pending === "active"}
            error={errors.active ?? null}
            onCancel={closeConfirm}
            onConfirm={() =>
              void exec(
                "active",
                () => (confirm === "end" ? actions.end(groupId) : actions.stepOut(groupId)),
                () => setConfirm(null),
              )
            }
          />
        </Sheet>
      ) : null}
    </section>
  );
}
