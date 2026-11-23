"use client";

/**
 * FundSection: the whole "Fondo" section of the group detail (drop it in as a fourth section).
 *
 * Props:
 *  - `groupId: string`
 *  - `state: GroupFineState | null`, `fund: GroupFund | null` (null = that read failed: its part
 *    shows `LoadFailed`, never a $0)
 *  - `role: GroupRole`, `archived: boolean` (admin controls are absent, not disabled, for members
 *    and in an archived group, which is read-only except that admins can still mark a payment), `myUserId: string`
 *  - `retryHref: string` (where the "Reintentar" of a failed read points: the group's page)
 *  - `now: number` (the page's clock, epoch ms: a proposal past its expiry shows no buttons)
 *  - `actions: Pick<GroupFineActions, "propose" | "vote" | "acceptActive" | "stepOut" | "end" | "setDebtPaid">`
 *  - `onChanged: () => void | Promise<void>` (REQUIRED: the page refreshes; called after every accepted
 *    action; return the refresh promise when there is one)
 * After an accepted fine action (propose, vote, accept, step out, end) the fine area shows a neutral
 * "Actualizando…" with no controls until the FIRST of: new `state` props, the `onChanged` promise
 * settling, or 8 seconds; it then renders from the props it has (controls back); a paid mark updates the debt row
 * and the totals exactly. Of each member: name, @usuario, avatar and amounts, nothing else. Every
 * action has a pending state and a single-flight guard; server errors show where the action was
 * taken. "La app solo registra. El pago se hace fuera de la app." is shown with every amount owed.
 */
import { useEffect, useMemo, useState } from "react";
import { LoadFailed } from "@/components/LoadFailed";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Sheet } from "@/components/ui/Sheet";
import type { GroupRole } from "@/lib/groups-contract";
import type { GroupFineActions, GroupFineState, GroupFund, GroupFundDebt } from "@/lib/groups-fines-contract";
import { ConfirmBody } from "../detail/AdminSheets";
import { createRunner } from "../detail/group-logic";
import { ActiveFineCard } from "./ActiveFineCard";
import { applyDebtPaid, canMarkPaid, createFineHandlers, fineUpdating, RULE_LINE, UPDATE_TIMEOUT_MS } from "./fund-logic";
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

/** The fine area between an accepted action and the fresh props: nothing to press. */
export function FineUpdating() {
  return (
    <Card className="p-4">
      <p role="status" aria-busy="true" className="min-h-12 text-body text-muted">
        Actualizando…
      </p>
    </Card>
  );
}

export function FundSection({
  groupId,
  state,
  fund,
  role,
  archived,
  myUserId,
  retryHref,
  now,
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
  now: number;
  actions: FundActions;
  onChanged: () => void | Promise<void>;
}) {
  const [runner] = useState(createRunner);
  const [pending, setPending] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [proposing, setProposing] = useState(false);
  const [upd, setUpd] = useState<{ since: number; settled: boolean } | null>(null);
  const [clock, setClock] = useState(0);

  // what the server accepted for a debt, kept on top of the props until the page hands down fresh ones
  const [fundOv, setFundOv] = useState<GroupFund | null>(null);
  const [seenState, setSeenState] = useState(state);
  const [seenFund, setSeenFund] = useState(fund);
  if (seenState !== state) {
    setSeenState(state);
    setUpd(null);
  }
  if (seenFund !== fund) {
    setSeenFund(fund);
    setFundOv(null);
  }

  const live = !archived;
  const admin = live && role === "admin";
  const fundView = fundOv ?? fund;
  const busy = pending !== null;
  const updating = fineUpdating({ since: upd?.since ?? null, propsChanged: false, settled: upd?.settled ?? false, now: clock });

  // the neutral state never outlives the timeout, even if no props and no settle ever arrive
  useEffect(() => {
    if (!upd || upd.settled) return;
    const t = setTimeout(() => setClock(Date.now()), UPDATE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [upd]);

  const run = useMemo(
    () =>
      createFineHandlers(runner, actions, groupId, {
        begin: (slot) => {
          setPending(slot);
          setErrors((e) => ({ ...e, [slot]: null }));
        },
        fail: (slot, error) => setErrors((e) => ({ ...e, [slot]: error })),
        end: () => setPending(null),
        updating: () => {
          const t = Date.now();
          setClock(t);
          setUpd({ since: t, settled: false });
        },
        changed: () => {
          // a returned promise ends the neutral state when it settles, resolved or rejected (a
          // rejected refresh must not freeze the card); a plain void waits for props or the timeout
          let r: void | Promise<void>;
          try {
            r = onChanged();
          } catch {
            r = Promise.resolve();
          }
          if (r && typeof r.then === "function")
            void r.catch(() => undefined).then(() => setUpd((u) => (u ? { ...u, settled: true } : u)));
        },
      }),
    [runner, actions, groupId, onChanged],
  );

  const closeConfirm = () => {
    if (!busy) setConfirm(null);
  };
  const ask = (c: Confirm) => {
    setErrors((e) => ({ ...e, active: null }));
    setConfirm(c);
  };
  const toggleDebt = (d: GroupFundDebt) => {
    const paid = d.paidAt === null;
    void run.debt(d.debtId, paid, () => setFundOv((f) => applyDebtPaid(f ?? fund ?? fundView!, d.debtId, paid)));
  };

  const proposal = state?.proposal ?? null;
  const showFund =
    fundView !== null && (Boolean(state?.active) || fundView.totals.registered > 0 || fundView.debts.length > 0);

  return (
    <section aria-label="Fondo" className="flex flex-col gap-3">
      <SectionHeader label="Fondo" />

      {state === null ? (
        <LoadFailed href={retryHref} />
      ) : updating ? (
        <FineUpdating />
      ) : (
        <>
          {proposal ? (
            <VoteCard
              proposal={proposal}
              canVote={live}
              pending={busy}
              error={errors.vote ?? null}
              now={now}
              onVote={(accept) => void run.vote(proposal.id, accept)}
            />
          ) : null}
          {state.active ? (
            <ActiveFineCard
              active={state.active}
              canChange={live}
              canEnd={admin}
              pending={busy}
              error={confirm ? null : (errors.active ?? null)}
              onAccept={() => void run.accept()}
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
        </div>
      ) : null}
      {showFund || proposal || state?.active ? <p className="text-small text-pretty text-muted">{RULE_LINE}</p> : null}

      {admin && state ? (
        <ProposalSheet
          open={proposing}
          onClose={() => setProposing(false)}
          singleAdmin={state.singleAdmin}
          pending={pending === "propose"}
          error={errors.propose ?? null}
          onSubmit={(amount, purpose) => void run.propose(amount, purpose, () => setProposing(false))}
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
            onConfirm={() => void (confirm === "end" ? run.end(() => setConfirm(null)) : run.stepOut(() => setConfirm(null)))}
          />
        </Sheet>
      ) : null}
    </section>
  );
}
