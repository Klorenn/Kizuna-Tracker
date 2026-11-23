"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logBodyWeight } from "@/app/(app)/perfil/body-actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import type { LocalDate } from "@/domain/types";

function WeightForm({ today, onDone }: { today: LocalDate; onDone: () => void }) {
  const router = useRouter();
  const [kg, setKg] = useState("");
  const [date, setDate] = useState<string>(today);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      // `today` and the field's max come from the server in the PROFILE timezone (never the
      // device clock), and native validation blocks a typed date past max. Today itself is left
      // to the server: a sheet opened before midnight then saves on the new day instead of
      // failing, so "fecha futura" cannot come from a device/profile timezone mismatch.
      const r = await logBodyWeight({ kg, date: date && date !== today ? date : undefined });
      if (!r.ok) return setError(r.error);
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Input
        label="Peso (kg)"
        name="peso"
        inputMode="decimal"
        autoComplete="off"
        placeholder="72,4"
        value={kg}
        onChange={(e) => setKg(e.target.value)}
        error={error}
        required
      />
      <Input
        label="Fecha"
        name="fecha"
        type="date"
        max={today}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        helper="Si ya registraste ese día, se reemplaza."
        required
      />
      <Button type="submit" disabled={busy || kg.trim() === ""}>
        Guardar peso
      </Button>
    </form>
  );
}

/** "Registrar peso": kg with comma or point, date today by default (past days allowed). */
export function BodyWeightSheet({ open, today, onClose }: { open: boolean; today: LocalDate; onClose: () => void }) {
  return (
    <Sheet open={open} title="Registrar peso" onClose={onClose}>
      <WeightForm today={today} onDone={onClose} />
    </Sheet>
  );
}
