"use client";

/**
 * ProposalSheet: the sheet where an admin proposes a fine ("Proponer multa").
 * `ProposalForm` props: `singleAdmin` (adds the note that nobody can reject their photos), `pending`,
 * `error` (server error or null), `onSubmit(amount, purpose)` (called only with a valid, trimmed
 * proposal: invalid input shows the binding error and never calls it).
 * `ProposalSheet` props: `open`, `onClose` plus the form's props; it cannot be dismissed while pending.
 */
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import { FINE_LIMITS } from "@/lib/groups-fines-contract";
import { ErrorLine } from "../detail/parts";
import { prepareProposal, RULE_LINE } from "./fund-logic";

type FormProps = {
  singleAdmin: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: (amount: number, purpose: string) => void;
};

export function ProposalForm({ singleAdmin, pending, error, onSubmit }: FormProps) {
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [local, setLocal] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const r = prepareProposal({ amount, purpose });
    setLocal(r.ok ? null : r.error);
    if (r.ok) onSubmit(r.amount, r.purpose);
  }

  const shown = local ?? error;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Input
        label="Monto por semana incumplida (CLP)"
        name="fine-amount"
        prefix="$"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="numeric"
        autoComplete="off"
        maxLength={9}
        disabled={pending}
        className="font-mono"
      />
      <Input
        label="¿Para qué es el fondo?"
        name="fine-purpose"
        placeholder="Asado de fin de mes"
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        maxLength={FINE_LIMITS.purposeMax}
        autoComplete="off"
        disabled={pending}
      />
      <p className="text-small text-pretty text-muted">
        Se activa si acepta al menos la mitad del grupo en 7 días. Solo obliga a quienes acepten.
      </p>
      <p className="text-small text-pretty text-muted">{RULE_LINE}</p>
      {singleAdmin ? (
        <p className="text-small text-pretty text-ink">Eres el único administrador: nadie podrá rechazar tus fotos.</p>
      ) : null}
      {shown ? <ErrorLine>{shown}</ErrorLine> : null}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Proponiendo…" : "Proponer"}
      </Button>
    </form>
  );
}

export function ProposalSheet({ open, onClose, ...form }: FormProps & { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <Sheet open title="Proponer multa" onClose={() => (form.pending ? undefined : onClose())} tall>
      <ProposalForm {...form} />
    </Sheet>
  );
}
