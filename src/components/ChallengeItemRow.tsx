"use client";

import { Warning } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { respondChallengeItem, withdrawChallengeItem } from "@/app/(app)/retos/actions";
import { AcceptOptions } from "@/components/AcceptOptions";
import { defaultAcceptSelection } from "@/lib/challenge-accept";
import { eligibleFor, itemRowText, itemSummary, type ItemRowData } from "@/lib/item-accept";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";

type Habit = { id: string; name: string; requiresPhoto: boolean };

/**
 * One live sub-reto of a challenge. Proposed ones carry the actions: the player whose turn it is accepts (with one
 * of their habits) or declines, the proposer withdraws. The actions revalidate /retos/[id], so no refresh here.
 */
export function ChallengeItemRow({
  item,
  otherName,
  habits,
}: {
  item: ItemRowData;
  otherName: string;
  /** The viewer's own habits that may join a challenge (not archived, not private). */
  habits: Habit[];
}) {
  const [sheet, setSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const choices = eligibleFor(habits, item.requiresPhoto);
  const [choice, setChoice] = useState(() => defaultAcceptSelection(item.theirName, choices).selected);
  const text = itemRowText(item, otherName);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, closeSheet = false) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) {
        if (closeSheet) setSheet(false);
      } else setError(r.error);
    });

  // the picker only holds existing habits: a "Crear" selection is not offered here
  const picked = choices.some((h) => h.id === choice) ? choice : (choices[0]?.id ?? "");

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex flex-col gap-[2px]">
        <p className="text-body font-medium text-ink">{text.title}</p>
        <p className="text-small text-muted">
          {itemSummary(item.target, item.requiresPhoto)}
          {text.status ? ` · ${text.status}` : ""}
        </p>
      </div>
      {error && !sheet ? (
        <p role="alert" className="flex items-start gap-[6px] text-small text-ink">
          <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}
      {item.pendingFor === "me" ? (
        <div className="flex gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => run(() => respondChallengeItem(item.id, false))}>
            Rechazar
          </Button>
          <Button disabled={busy} onClick={() => setSheet(true)}>
            Aceptar
          </Button>
        </div>
      ) : null}
      {item.pendingFor === "them" ? (
        <Button variant="ghost" disabled={busy} onClick={() => run(() => withdrawChallengeItem(item.id))}>
          Retirar
        </Button>
      ) : null}
      {item.pendingFor === "me" ? (
        <Sheet open={sheet} title="Elige tu hábito" onClose={() => setSheet(false)}>
          {choices.length === 0 ? (
            <p role="alert" className="text-body text-ink">
              No tienes un hábito disponible{item.requiresPhoto ? " con foto en vivo" : ""} para este sub-reto. Crea
              uno primero.
            </p>
          ) : (
            <AcceptOptions
              otherName={otherName}
              proposedName={item.theirName}
              createSubline=""
              createSimple={false}
              habits={choices}
              canCreate={false}
              selected={picked}
              onSelect={setChoice}
            />
          )}
          {error ? (
            <p role="alert" className="flex items-start gap-[6px] text-small text-ink">
              <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
              {error}
            </p>
          ) : null}
          <Button
            disabled={busy || !picked}
            onClick={() => run(() => respondChallengeItem(item.id, true, picked), true)}
          >
            Aceptar sub-reto
          </Button>
          <Button variant="ghost" onClick={() => setSheet(false)}>
            Cancelar
          </Button>
        </Sheet>
      ) : null}
    </div>
  );
}
