"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { restoreHabit } from "@/app/(app)/habitos/actions";
import { Button } from "@/components/ui/Button";

export function RestoreButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        variant="secondary"
        className="w-auto"
        disabled={pending}
        aria-label={`Restaurar ${name}`}
        onClick={() =>
          start(async () => {
            const r = await restoreHabit(id);
            if (r.ok) router.refresh();
            setError(r.ok ? null : r.error);
          })
        }
      >
        {pending ? "Volviendo…" : "Restaurar"}
      </Button>
      {error ? (
        <p role="alert" className="text-small text-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
