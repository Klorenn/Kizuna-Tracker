"use client";

import { Check, EyeSlash, Warning, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { rejectCheckin } from "@/app/(app)/retos/actions";
import { REJECT_LABEL, REJECT_REASONS, type RejectReason } from "@/lib/challenge-form";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";

export function RejectSheet({
  open,
  onClose,
  checkinId,
  ownerName,
  rejectedCount,
}: {
  open: boolean;
  onClose: () => void;
  checkinId: string;
  ownerName: string;
  /** Photos you have already rejected from this person in this challenge. */
  rejectedCount: number;
}) {
  const [reason, setReason] = useState<RejectReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  const history =
    rejectedCount === 0
      ? `Es la primera foto que rechazas en este reto. ${ownerName} también lo ve.`
      : `En este reto rechazaste ${rejectedCount} ${rejectedCount === 1 ? "foto" : "fotos"}. ${ownerName} también lo ve.`;

  return (
    <Sheet open={open} title="Rechazar foto" onClose={onClose}>
      <p className="text-body text-muted">
        {ownerName} verá el motivo. Si la rechazas, este check-in no cuenta para el reto.
      </p>
      <div
        role="radiogroup"
        aria-label="Motivo"
        className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface px-4 shadow-card"
      >
        {REJECT_REASONS.map((r) => {
          const selected = r === reason;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setReason(r)}
              className="flex min-h-[52px] items-center gap-3 text-left"
            >
              <span
                aria-hidden
                className={`flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                  selected ? "border-accent" : "border-outline-strong bg-surface"
                }`}
              >
                {selected ? <span className="size-[10px] rounded-full bg-accent" /> : null}
              </span>
              <span className={`flex-1 text-body text-ink ${selected ? "font-medium" : ""}`}>
                {REJECT_LABEL[r]}
              </span>
              {selected ? <Check size={20} weight="light" className="text-accent" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      <p className="flex items-center gap-2 text-small text-muted">
        <EyeSlash size={16} weight="light" className="shrink-0" aria-hidden />
        {history}
      </p>
      {error ? (
        <p role="alert" className="flex items-start gap-[6px] text-small text-ink">
          <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}
      <Button
        disabled={busy || !reason}
        onClick={() =>
          reason &&
          start(async () => {
            setError(null);
            const r = await rejectCheckin(checkinId, reason);
            if (r.ok) {
              onClose();
              router.refresh();
            } else setError(r.error);
          })
        }
      >
        Rechazar foto
      </Button>
      <Button variant="ghost" onClick={onClose}>
        Cancelar
      </Button>
    </Sheet>
  );
}

/** "Rechazar foto" button of the detail screen, with its sheet. */
export function RejectPhotoButton(props: Omit<React.ComponentProps<typeof RejectSheet>, "open" | "onClose">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <X size={20} weight="light" aria-hidden />
        Rechazar foto
      </Button>
      <RejectSheet {...props} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
