"use client";

import { DotsThree, UserMinus, Warning } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeFriend } from "@/app/(app)/amigos/actions";
import { Button } from "@/components/ui/Button";
import { ListRow } from "@/components/ui/ListRow";
import { Sheet } from "@/components/ui/Sheet";

/**
 * Friend profile "Más opciones": a sheet with "Eliminar amigo", which turns into the confirmation
 * (what happens to challenges, activity and debts) before anything is removed.
 */
export function FriendOverflow({ userId, firstName }: { userId: string; firstName: string }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  function close() {
    if (busy) return;
    setOpen(false);
    setConfirming(false);
    setError(null);
  }

  function remove() {
    start(async () => {
      setError(null);
      const r = await removeFriend(userId);
      if (!r.ok) return setError(r.error);
      router.replace("/amigos");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        aria-label="Más opciones"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="inline-flex size-12 shrink-0 items-center justify-center rounded-md border border-outline-strong bg-surface text-ink transition-colors duration-[120ms] hover:bg-field"
      >
        <DotsThree size={22} weight="light" aria-hidden />
      </button>
      <Sheet open={open} title={confirming ? `Eliminar a ${firstName}` : firstName} onClose={close}>
        {confirming ? (
          <>
            <ul className="flex flex-col gap-2 text-body text-ink">
              <li>Se cancelan los retos activos y propuestos entre ustedes.</li>
              <li>Dejan de ver los hábitos, la actividad y las fotos del otro.</li>
              <li className="text-muted">Las deudas que ya tienen se mantienen en Deudas.</li>
            </ul>
            {error ? (
              <p role="alert" className="flex items-start gap-[6px] text-small text-ink">
                <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
                {error}
              </p>
            ) : null}
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={remove}
                className="border-alert! text-alert-text! hover:bg-alert-soft!"
              >
                <UserMinus size={20} weight="light" aria-hidden />
                {busy ? "Eliminando…" : "Eliminar amigo"}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={close}>
                Cancelar
              </Button>
            </div>
          </>
        ) : (
          <div className="-mx-5 border-t border-line">
            <ListRow
              icon={<UserMinus size={20} weight="light" />}
              label="Eliminar amigo"
              hint="Te pediremos confirmación"
              tone="danger"
              onClick={() => setConfirming(true)}
            />
          </div>
        )}
      </Sheet>
    </>
  );
}
