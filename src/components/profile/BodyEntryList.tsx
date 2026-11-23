"use client";

import { Trash } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteBodyWeight } from "@/app/(app)/perfil/body-actions";
import { entryDateLabel } from "@/components/profile/body-view";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Sheet } from "@/components/ui/Sheet";
import { formatKg1 } from "@/domain/body";
import type { LocalDate } from "@/domain/types";

export type BodyEntry = { id: string; date: LocalDate; kg: number };

/** Private weigh-ins, newest first, each with a delete that asks first. Owner-only data. */
export function BodyEntryList({ entries, today }: { entries: BodyEntry[]; today: LocalDate }) {
  const router = useRouter();
  const [target, setTarget] = useState<BodyEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function close() {
    setTarget(null);
    setError(null);
  }

  function confirm() {
    if (!target) return;
    setError(null);
    start(async () => {
      const r = await deleteBodyWeight(target.id);
      if (!r.ok) return setError(r.error);
      close();
      router.refresh();
    });
  }

  return (
    <>
      <ul className="divide-y divide-line">
        {entries.map((e) => (
          <li key={e.id} className="flex min-h-[52px] items-center gap-3 pl-4 pr-1">
            <span className="flex-1 text-body text-muted">{entryDateLabel(e.date, today)}</span>
            <span className="font-mono text-[17px] font-semibold text-ink">{formatKg1(e.kg)}</span>
            <IconButton label={`Borrar el registro del ${entryDateLabel(e.date, today)}`} onClick={() => setTarget(e)}>
              <Trash size={20} weight="light" aria-hidden />
            </IconButton>
          </li>
        ))}
      </ul>
      <Sheet open={target !== null} title="Borrar registro" onClose={close}>
        {target ? (
          <>
            <p className="text-body text-ink">
              Se borra tu peso del {entryDateLabel(target.date, today)}:{" "}
              <span className="font-mono">{formatKg1(target.kg)}</span>. No se puede deshacer.
            </p>
            {error ? (
              <p role="alert" className="text-small text-ink">
                {error}
              </p>
            ) : null}
            <div className="flex flex-col gap-2">
              <Button disabled={busy} onClick={confirm}>
                Borrar registro
              </Button>
              <Button variant="secondary" onClick={close}>
                Cancelar
              </Button>
            </div>
          </>
        ) : null}
      </Sheet>
    </>
  );
}
