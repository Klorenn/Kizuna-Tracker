"use client";

import { Check, Warning } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setDebtPaid } from "@/app/(app)/deudas/actions";
import { Button } from "./ui/Button";

/** Creditor-only control: marks (or unmarks) every given debt as paid. */
export function DebtButton({
  debtIds,
  paid,
  label,
  variant = "secondary",
}: {
  debtIds: string[];
  paid: boolean;
  label: string;
  variant?: "secondary" | "ghost";
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  function run() {
    setError(null);
    start(async () => {
      for (const id of debtIds) {
        const r = await setDebtPaid(id, paid);
        if (!r.ok) {
          setError(r.error);
          break;
        }
      }
      router.refresh();
    });
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <Button variant={variant} disabled={busy} onClick={run}>
        {variant === "secondary" ? <Check size={20} weight="light" aria-hidden /> : null}
        {label}
      </Button>
      {error ? (
        <p role="alert" className="flex items-center gap-2 text-small text-ink">
          <Warning size={16} weight="light" className="shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
