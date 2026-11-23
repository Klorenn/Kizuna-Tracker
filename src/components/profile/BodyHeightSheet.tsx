"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setHeight } from "@/app/(app)/perfil/body-actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";

function HeightForm({ current, onDone }: { current: number | null; onDone: () => void }) {
  const router = useRouter();
  const [cm, setCm] = useState(current === null ? "" : String(current).replace(".", ","));
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function save(value: string | null) {
    setError(null);
    start(async () => {
      const r = await setHeight(value);
      if (!r.ok) return setError(r.error);
      onDone();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(cm);
      }}
      className="flex flex-col gap-4"
    >
      <Input
        label="Altura (cm)"
        name="altura"
        inputMode="decimal"
        autoComplete="off"
        placeholder="172"
        value={cm}
        onChange={(e) => setCm(e.target.value)}
        error={error}
      />
      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={busy || cm.trim() === ""}>
          Guardar altura
        </Button>
        {current !== null ? (
          <Button variant="secondary" disabled={busy} onClick={() => save(null)}>
            Quitar altura
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** "Editar altura": cm with comma or point; clearing it is allowed. */
export function BodyHeightSheet({
  open,
  current,
  onClose,
}: {
  open: boolean;
  current: number | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} title="Editar altura" onClose={onClose}>
      <HeightForm current={current} onDone={onClose} />
    </Sheet>
  );
}
