"use client";

import { Warning } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/** Small in-place state for a section whose read failed: says so, and re-reads the page. */
export function SectionRetry({ what }: { what: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <Card className="flex flex-col gap-3 p-4">
      <p role="alert" className="flex items-start gap-[6px] text-small text-ink">
        <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
        No pudimos cargar {what}.
      </p>
      <Button variant="secondary" disabled={busy} onClick={() => start(() => router.refresh())}>
        {busy ? "Cargando…" : "Reintentar"}
      </Button>
    </Card>
  );
}
