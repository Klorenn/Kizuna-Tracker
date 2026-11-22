"use client";

import { Plus } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createGoal } from "@/app/(app)/metas/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";

type Kind = "weekly" | "total";

/** "Nueva meta" trigger (mono accent label, as the section header action) plus its sheet. */
export function NewGoalSheet({ habits }: { habits: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [habitId, setHabitId] = useState(habits[0]?.id ?? "");
  const [kind, setKind] = useState<Kind>("weekly");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(target);
    start(async () => {
      const r = await createGoal({
        habitId,
        kind,
        target: n,
        deadline: kind === "total" && deadline ? deadline : null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      setTarget("");
      setDeadline("");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={habits.length === 0}
        className="section-label inline-flex h-11 items-center gap-1 text-accent disabled:text-muted"
      >
        <Plus size={16} weight="light" aria-hidden />
        Nueva meta
      </button>
      <Sheet open={open} title="Nueva meta" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-small text-ink">
            Hábito
            <select
              value={habitId}
              onChange={(e) => setHabitId(e.target.value)}
              className="h-11 rounded-md border border-outline-strong bg-paper px-3 text-body text-ink"
            >
              {habits.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
          <Segmented<Kind>
            label="Tipo de meta"
            options={[
              { value: "weekly", label: "Semanal" },
              { value: "total", label: "Total" },
            ]}
            value={kind}
            onChange={setKind}
          />
          <Input
            label={kind === "weekly" ? "Días por semana" : "Cantidad de check-ins"}
            name="target"
            type="number"
            inputMode="numeric"
            min={1}
            max={kind === "weekly" ? 7 : undefined}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
          />
          {kind === "total" ? (
            <Input
              label="Fecha límite (opcional)"
              name="deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          ) : null}
          {error ? (
            <p role="alert" className="text-small text-ink">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy || !habitId || target === ""}>
            Crear meta
          </Button>
        </form>
      </Sheet>
    </>
  );
}
