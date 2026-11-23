"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import { Warning } from "@phosphor-icons/react";
import { formatAmount, progressLabel, type QuantityConfig } from "@/domain/quantity";
import { parseTypedAmountResult } from "@/lib/quantity-queue";

/** One sum of today. `saved` is false while it waits for the server (no "Quitar" until then). */
export type QuantityEntryView = { id: string; amount: number; at: string; saved: boolean };

/**
 * Sheet to add a free amount and to review or remove today's sums.
 *
 * Props (plain, mounted by QuantityControl or by Hoy):
 * - open / onClose: visibility.
 * - config: `QuantityConfig` of the habit (amounts are in base units).
 * - total: today's total shown in the header (base units).
 * - entries: today's sums, oldest first (`{ id, amount, at: ISO instant, saved }`).
 * - timeZone: IANA zone for the "08:10" time of each sum.
 * - onAdd(amount): adds a sum, already parsed to base units.
 * - onRemove(entryId): removes a sum; resolves when done (the parent reports errors).
 * - messages: optional notices (a refused sum, offline, pending count) shown inside the sheet, because
 *   the page's own notices sit under the sheet's overlay.
 */
export function QuantitySheet({
  open,
  onClose,
  config,
  total,
  entries,
  timeZone,
  onAdd,
  onRemove,
  messages = [],
}: {
  open: boolean;
  onClose: () => void;
  config: QuantityConfig;
  total: number;
  entries: QuantityEntryView[];
  timeZone: string;
  onAdd: (amount: number) => void;
  onRemove: (entryId: string) => Promise<void> | void;
  messages?: string[];
}) {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hour = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
    } catch {
      return new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    }
  }, [timeZone]);

  const last = [...entries].reverse().find((e) => e.saved) ?? null;
  // plural unit word ("ml", "vasos", "pasos", the custom label)
  const unitHint = formatAmount(2, config).replace(/^[\d.,]+\s/, "");

  function submit() {
    const parsed = parseTypedAmountResult(raw, config);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    onAdd(parsed.amount);
    setRaw("");
  }

  const remove = (id: string) => startTransition(async () => void (await onRemove(id)));

  return (
    <Sheet open={open} title="Cantidad de hoy" onClose={onClose} tall>
      <p className="font-mono text-body font-medium text-ink" aria-live="polite">
        {progressLabel(total, config)}
      </p>

      {messages.map((m) => (
        <p key={m} role="status" className="flex items-start gap-[6px] text-small text-pretty text-ink">
          <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
          {m}
        </p>
      ))}

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input
          label={`Otra cantidad (${unitHint})`}
          name="quantity-amount"
          inputMode="decimal"
          autoComplete="off"
          className="font-mono"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setError(null);
          }}
          error={error}
        />
        <Button type="submit">
          Sumar
        </Button>
      </form>

      {entries.length === 0 ? (
        <p className="text-small text-muted">Aún no sumas nada hoy.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {entries.map((e) => (
            <li key={e.id} className="flex min-h-11 items-center gap-2 py-1">
              <span className="flex-1 font-mono text-small text-ink">
                {hour.format(new Date(e.at))} · +{formatAmount(e.amount, config)}
                {e.saved ? "" : " · guardando"}
              </span>
              {e.saved ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(e.id)}
                  className="inline-flex h-11 min-w-11 items-center justify-center rounded-md px-3 text-small font-medium text-accent hover:bg-accent-soft disabled:text-muted"
                >
                  Quitar
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {last ? (
        <Button variant="secondary" disabled={pending} onClick={() => remove(last.id)}>
          Deshacer la última
        </Button>
      ) : null}
    </Sheet>
  );
}
