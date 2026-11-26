"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cancelPractice, startPractice } from "./actions";

export function PracticeForm({ habits }: { habits: { id: string; name: string }[] }) {
  const router = useRouter();
  const [habitId, setHabitId] = useState(habits[0]?.id ?? "");
  const [target, setTarget] = useState("3");
  const [weeks, setWeeks] = useState("1");
  const [fine, setFine] = useState("1000");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    start(async () => {
      const r = await startPractice({
        habitId,
        target: Number(target),
        weeks: Number(weeks),
        fineAmount: Number(fine),
      });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-small text-muted">
        Hábito
        <select
          aria-label="Hábito"
          value={habitId}
          onChange={(e) => setHabitId(e.target.value)}
          className="h-12 rounded-md border border-outline-strong bg-paper px-3 text-body text-ink"
        >
          {habits.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </label>
      <Input label="Días por semana" name="target" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
      <Input label="Semanas (1 a 4)" name="weeks" inputMode="numeric" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
      <Input label="Multa de práctica" name="fine" inputMode="numeric" value={fine} onChange={(e) => setFine(e.target.value)} />
      {error ? (
        <p role="alert" className="text-small text-ink">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending || habits.length === 0}>
        {pending ? "Creando…" : "Empezar la práctica"}
      </Button>
    </form>
  );
}

export function ClosePractice({ id, finished }: { id: string; finished: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await cancelPractice(id);
            if (!r.ok) setError(r.error);
            else router.refresh();
          })
        }
      >
        {finished ? "Cerrar la práctica" : "Cancelar la práctica"}
      </Button>
      {error ? (
        <p role="alert" className="text-small text-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
