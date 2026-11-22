"use client";

import { Warning } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { archiveHabit, setHabitVisibility } from "@/app/(app)/habitos/actions";
import type { Visibility } from "@/domain/presets";
import { VisibilityPicker } from "./VisibilityPicker";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";

/** Visibility (saved on change) and archive with confirmation. */
export function HabitSettings({
  habitId,
  visibility,
}: {
  habitId: string;
  visibility: Visibility;
}) {
  const router = useRouter();
  const [value, setValue] = useState(visibility);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  function change(next: Visibility) {
    const previous = value;
    setValue(next);
    setError(null);
    start(async () => {
      const r = await setHabitVisibility(habitId, next);
      if (!r.ok) {
        setValue(previous);
        setError(r.error);
      }
    });
  }

  function archive() {
    start(async () => {
      const r = await archiveHabit(habitId);
      if (!r.ok) {
        setConfirm(false);
        setError(r.error);
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <VisibilityPicker value={value} onChange={change} />
      {error ? (
        <p role="alert" className="flex items-center gap-1 text-small text-ink">
          <Warning size={16} weight="light" className="shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}
      <Button variant="ghost" onClick={() => setConfirm(true)}>
        Archivar hábito
      </Button>
      <Sheet open={confirm} title="¿Archivar este hábito?" onClose={() => setConfirm(false)}>
        <p className="text-body text-muted">
          Dejará de aparecer en Hoy. Tu historial se conserva.
        </p>
        <Button onClick={archive} disabled={pending}>
          Archivar
        </Button>
        <Button variant="secondary" onClick={() => setConfirm(false)}>
          Cancelar
        </Button>
      </Sheet>
    </div>
  );
}
