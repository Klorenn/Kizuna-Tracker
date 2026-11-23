"use client";

import { Timer, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { addTime, checkInWithoutTime, deleteTimeEntry, setTimeEntry } from "@/app/(app)/registros/time-actions";
import { CatAnimation } from "@/components/brand/CatAnimation";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import { formatDuration, parseDuration } from "@/domain/time";
import { holdCelebrations } from "@/lib/celebration-bus";

/*
 * TimeSheet: "¿Cuánto rato?" Self-contained (plain props); Hoy (Task 28) mounts it.
 *
 *   <TimeSheet open onClose mode preset onSaved? />
 *   - open / onClose: render it only while open (the form starts from its props each time).
 *   - mode:
 *       { kind: "checkin", habitId }  Hoy "Hecho": Guardar (add_time: checks in + adds), Solo marcar
 *                                     (checks in without time), "Medir con temporizador".
 *       { kind: "add", habitId }      "+ Tiempo" on a habit already done today: adds, no Solo marcar.
 *       { kind: "edit", checkinId, entry }  any day with a check-in: fixes the total
 *                                     (set_time_entry) or deletes it. Never touches the check-in.
 *   - preset: the habit's preset key; "study" labels the topic "Qué estudiaste", otherwise "Tema".
 *   - onSaved(message): after a save, skip or delete, with the toast text.
 */
export type TimeSheetMode =
  | { kind: "checkin"; habitId: string }
  | { kind: "add"; habitId: string }
  | { kind: "edit"; checkinId: string; entry: { minutes: number; topic: string | null } | null };

const QUICK = [
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "45 min", minutes: 45 },
  { label: "1 h", minutes: 60 },
] as const;

/** What to tell the user when Horas / Minutos do not make a valid time; null when they do. */
export function timeInputError(h: string, m: string): string | null {
  if (parseDuration(h, m) !== null) return null;
  const hs = h.trim();
  const ms = m.trim();
  if (/[.,]/.test(hs) || /[.,]/.test(ms)) return "Usa números enteros: 1 h 30 min en lugar de 1,5 h.";
  if ((hs !== "" && !/^\d+$/.test(hs)) || (ms !== "" && !/^\d+$/.test(ms))) return "Escribe solo números.";
  const minutes = Number(ms === "" ? 0 : ms);
  if (minutes > 59) {
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    const suggestion = mm === 0 ? `${hh} h` : `${hh} h ${mm} min`;
    return `Los minutos van de 0 a 59. Para ${minutes} min escribe ${suggestion}.`;
  }
  return "El tiempo va de 1 minuto a 24 horas.";
}

export function timeTitle(mode: TimeSheetMode): string {
  if (mode.kind === "checkin") return "¿Cuánto rato?";
  if (mode.kind === "add") return "Sumar tiempo";
  return mode.entry ? "Editar tiempo" : "Añadir tiempo";
}

export function TimeSheet({
  open,
  onClose,
  mode,
  preset,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  mode: TimeSheetMode;
  preset: string | null;
  onSaved?: (message: string) => void;
}) {
  return (
    <Sheet open={open} title={timeTitle(mode)} onClose={onClose} tall>
      <TimeForm mode={mode} preset={preset} onFinished={onClose} onSaved={onSaved} />
    </Sheet>
  );
}

/**
 * Chips, Horas / Minutos, topic, and the actions of the mode. `onFinished` runs after a
 * successful save, skip or delete. Also used on its own on `/habitos/<id>/tiempo`.
 */
export function TimeForm({
  mode,
  preset,
  onFinished,
  onSaved,
}: {
  mode: TimeSheetMode;
  preset: string | null;
  onFinished: () => void;
  onSaved?: (message: string) => void;
}) {
  const router = useRouter();
  const existing = mode.kind === "edit" ? mode.entry : null;
  const [h, setH] = useState(existing ? String(Math.floor(existing.minutes / 60)) : "");
  const [m, setM] = useState(existing ? String(existing.minutes % 60) : "");
  const [topic, setTopic] = useState(existing?.topic ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Hoy's sheet: no celebration may open on top of it; Hoy re-evaluates when it closes.
  const holdsHoy = mode.kind === "checkin";
  useEffect(() => (holdsHoy ? holdCelebrations() : undefined), [holdsHoy]);

  const total = parseDuration(h, m);
  const habitId = mode.kind === "edit" ? null : mode.habitId;

  function quick(minutes: number) {
    setH(String(Math.floor(minutes / 60)));
    setM(String(minutes % 60));
    setError(null);
  }

  function save() {
    if (total === null) return setError(timeInputError(h, m));
    setError(null);
    start(async () => {
      const res =
        mode.kind === "edit" ? await setTimeEntry(mode.checkinId, total, topic) : await addTime(mode.habitId, total, topic);
      if (!res.ok) return setError(res.error);
      onFinished();
      onSaved?.("Tiempo guardado");
      router.refresh();
    });
  }

  function skip() {
    if (mode.kind !== "checkin") return;
    setError(null);
    start(async () => {
      const res = await checkInWithoutTime(mode.habitId);
      if (!res.ok) return setError(res.error);
      onFinished();
      router.refresh();
    });
  }

  function remove() {
    if (mode.kind !== "edit") return;
    start(async () => {
      const res = await deleteTimeEntry(mode.checkinId);
      if (!res.ok) return setError(res.error);
      onFinished();
      onSaved?.("Tiempo borrado");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-1">
      {mode.kind !== "edit" ? (
        <div className="flex items-center gap-3">
          {/* small and still: the code cat only moves on the Pomodoro screen */}
          <CatAnimation asset="code" width={48} variant="still" />
          <p className="text-small text-muted">Anota cuánto rato le dedicaste hoy.</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Duraciones rápidas">
        {QUICK.map((q) => (
          <Chip key={q.minutes} selected={total === q.minutes} onClick={() => quick(q.minutes)}>
            {q.label}
          </Chip>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Horas"
          name="time-hours"
          inputMode="numeric"
          placeholder="0"
          value={h}
          className="font-mono"
          onChange={(e) => setH(e.target.value)}
        />
        <Input
          label="Minutos"
          name="time-minutes"
          inputMode="numeric"
          placeholder="0"
          value={m}
          className="font-mono"
          onChange={(e) => setM(e.target.value)}
        />
      </div>
      <p className="font-mono text-body font-medium text-ink" aria-live="polite">
        {total === null ? "—" : formatDuration(total)}
      </p>
      <Input
        label={preset === "study" ? "Qué estudiaste (opcional)" : "Tema (opcional)"}
        name="time-topic"
        value={topic}
        maxLength={60}
        autoComplete="off"
        onChange={(e) => setTopic(e.target.value)}
      />
      {error ? (
        <p role="alert" className="flex items-start gap-1 text-small text-pretty text-ink">
          <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}
      <Button onClick={save} disabled={pending}>
        Guardar
      </Button>
      {mode.kind === "checkin" ? (
        <Button variant="secondary" onClick={skip} disabled={pending}>
          Solo marcar
        </Button>
      ) : null}
      {habitId ? (
        <Link
          href={`/habitos/${habitId}/pomodoro`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md text-body font-medium text-accent hover:bg-accent-soft"
        >
          <Timer size={20} weight="light" aria-hidden />
          Medir con temporizador
        </Link>
      ) : existing ? (
        confirmDelete ? (
          <div className="flex flex-col gap-2 rounded-md bg-field p-3">
            <p className="text-small text-ink">Se borrará el tiempo de este día. Tu check-in no cambia.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button onClick={remove} disabled={pending}>
                Borrar
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)} disabled={pending}>
            Borrar registro
          </Button>
        )
      ) : null}
    </div>
  );
}
