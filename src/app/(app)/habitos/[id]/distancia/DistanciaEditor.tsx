"use client";

import { Plus } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteCardio } from "@/app/(app)/registros/cardio-actions";
import { CardioEntryRow, type CardioRowEntry } from "@/components/logs/CardioEntryRow";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SkeletonBar } from "@/components/ui/Skeleton";
import { Toast, useToast } from "@/components/ui/Toast";
import type { CardioKind } from "@/domain/cardio";

// the sheet is not visible on first paint: its code loads when it first opens
const CardioSheet = dynamic(() => import("@/components/logs/CardioSheet").then((m) => m.CardioSheet), {
  loading: () => <CardioSheetPlaceholder />,
});

/** Faint sheet shape while the code arrives (only ever shown after a tap on "Salida"). */
function CardioSheetPlaceholder() {
  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-md flex-col gap-4 rounded-t-lg bg-surface px-5 pb-6 pt-8 shadow-card">
      <span className="sr-only">Cargando</span>
      <SkeletonBar className="h-6 w-48" />
      <SkeletonBar className="h-11 w-full" />
      <SkeletonBar className="h-11 w-full" />
    </div>
  );
}

const MAX_PER_DAY = 10;

/**
 * The outings of one day: list, edit in a sheet, delete with confirmation, "+ Salida". Every change
 * refreshes the page, so the rows always come from the database.
 */
export function DistanciaEditor({
  habitId,
  checkinId,
  entries,
  defaultKind,
}: {
  habitId: string;
  checkinId: string;
  entries: CardioRowEntry[];
  defaultKind: CardioKind;
}) {
  const router = useRouter();
  const [toast, showToast] = useToast();
  const [adding, setAdding] = useState(false);
  // a new round remounts the form, so every opening starts from the defaults
  const [addRound, setAddRound] = useState(0);
  const addedOnce = addRound > 0;
  const [editing, setEditing] = useState<CardioRowEntry | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const full = entries.length >= MAX_PER_DAY;

  function remove(id: string) {
    setError(null);
    start(async () => {
      const res = await deleteCardio(id);
      setConfirming(null);
      if (!res.ok) setError(res.error);
      else showToast("Salida borrada");
      router.refresh();
    });
  }

  return (
    <>
      <Card className="flex flex-col gap-2 p-4">
        {entries.length === 0 ? (
          <p className="text-small text-muted">Aún no hay salidas este día.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {entries.map((e) =>
              confirming === e.id ? (
                <li key={e.id} className="flex flex-col gap-2 py-2">
                  <p className="text-small text-ink">Se borrará esta salida. Tu check-in no cambia.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" onClick={() => setConfirming(null)} disabled={pending}>
                      Cancelar
                    </Button>
                    <Button onClick={() => remove(e.id)} disabled={pending}>
                      Borrar
                    </Button>
                  </div>
                </li>
              ) : (
                <CardioEntryRow
                  key={e.id}
                  entry={e}
                  disabled={pending}
                  onEdit={() => setEditing(e)}
                  onDelete={() => setConfirming(e.id)}
                />
              ),
            )}
          </ul>
        )}
        {error ? (
          <p role="alert" className="text-small text-ink">
            {error}
          </p>
        ) : null}
        <Button variant="secondary" onClick={() => {
            setAddRound((n) => n + 1);
            setAdding(true);
          }}
          disabled={full}
        >
          <Plus size={20} weight="light" aria-hidden />
          Salida
        </Button>
        {full ? <p className="text-small text-muted">Puedes registrar hasta 10 salidas por día.</p> : null}
      </Card>
      {/* first tap loads the code; afterwards the sheet stays mounted and only `open` changes */}
      {addedOnce ? (
        <CardioSheet
          key={addRound}
          open={adding}
          onClose={() => setAdding(false)}
          habitId={habitId}
          mode={{ kind: "add", checkinId }}
          defaultKind={entries.at(-1)?.kind ?? defaultKind}
          onSaved={showToast}
        />
      ) : null}
      {editing ? (
        <CardioSheet
          open
          onClose={() => setEditing(null)}
          habitId={habitId}
          mode={{
            kind: "edit",
            entryId: editing.id,
            entry: {
              kind: editing.kind,
              distanceM: editing.distanceM,
              durationS: editing.durationS,
              effort: editing.effort,
              note: editing.note,
            },
          }}
          onSaved={showToast}
        />
      ) : null}
      <Toast message={toast} />
    </>
  );
}
