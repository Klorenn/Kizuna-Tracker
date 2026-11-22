"use client";

import { ArrowRight, Lock, Minus, Plus, Receipt, Warning } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { proposeChallenge } from "@/app/(app)/retos/actions";
import { formatCLP } from "@/domain/ledger";
import type { IconKey } from "@/domain/presets";
import { MAX_FINE, validateChallengeInput } from "@/lib/challenge-form";
import { HabitIcon } from "./habit-icon";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Segmented } from "./ui/Segmented";

export type FriendOption = { id: string; name: string; username: string };
export type HabitOption = { id: string; name: string; icon: string; requiresPhoto: boolean };

const SELECT =
  "h-11 w-full rounded-md border border-outline-strong bg-paper px-3 text-body text-ink outline-none focus:border-accent focus:shadow-[inset_0_0_0_1px_var(--color-accent)]";

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const btn =
    "inline-flex size-11 items-center justify-center rounded-full border border-outline-strong bg-surface text-ink disabled:opacity-40";
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <p className="flex-1 text-body text-ink">{label}</p>
      <button type="button" className={btn} aria-label={`Menos: ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus size={20} weight="light" aria-hidden />
      </button>
      <p aria-live="polite" className="min-w-4 text-center font-mono text-[15px] font-medium text-ink">
        {value}
      </p>
      <button type="button" className={btn} aria-label={`Más: ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus size={20} weight="light" aria-hidden />
      </button>
    </div>
  );
}

export function ChallengeForm({
  friends,
  habits,
  initialHabitId,
  habitLocked,
}: {
  friends: FriendOption[];
  habits: HabitOption[];
  initialHabitId: string | null;
  habitLocked: boolean;
}) {
  const [rivalId, setRivalId] = useState("");
  const [habitId, setHabitId] = useState(initialHabitId ?? "");
  const [type, setType] = useState<"daily" | "weekly">("weekly");
  const [target, setTarget] = useState(4);
  const [weeks, setWeeks] = useState(4);
  const [fine, setFine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  const rival = friends.find((f) => f.id === rivalId);
  const habit = habits.find((h) => h.id === habitId);
  const fineAmount = fine ? Number(fine) : 0;
  const frequency = type === "daily" ? ({ type: "daily" } as const) : ({ type: "weekly", target } as const);
  const valid = validateChallengeInput({ rivalId, habitId, frequency, weeks, fineAmount }).ok;
  const fineShown = fineAmount > 0 ? formatCLP(fineAmount) : "la multa";
  const who = rival?.name.split(" ")[0] ?? "tu amigo";

  function submit() {
    start(async () => {
      setError(null);
      const r = await proposeChallenge({ rivalId, habitId, frequency, weeks, fineAmount });
      if (r.ok) router.replace("/retos");
      else setError(r.error);
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) submit();
      }}
    >
      {habitLocked && habit ? (
        <div className="flex flex-col gap-2">
          <p className="text-small text-ink">Hábito</p>
          <div className="flex h-12 items-center gap-2 rounded-md bg-field px-3">
            <HabitIcon name={habit.icon as IconKey} />
            <p className="flex-1 truncate text-body text-ink">
              {habit.name}
              {habit.requiresPhoto ? " · foto en vivo" : ""}
            </p>
            <Lock size={16} weight="light" className="shrink-0 text-muted" aria-label="Bloqueado" />
          </div>
          <p className="text-small text-muted">Viene de tu hábito. Tu amigo elige el suyo al aceptar.</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="rival" className="text-small text-ink">
          Amigo
        </label>
        <select id="rival" className={SELECT} value={rivalId} onChange={(e) => setRivalId(e.target.value)}>
          <option value="">Elige a un amigo</option>
          {friends.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} · @{f.username}
            </option>
          ))}
        </select>
      </div>

      {!habitLocked ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="habit" className="text-small text-ink">
            Tu hábito
          </label>
          <select id="habit" className={SELECT} value={habitId} onChange={(e) => setHabitId(e.target.value)}>
            <option value="">Elige un hábito</option>
            {habits.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
                {h.requiresPhoto ? " · foto en vivo" : ""}
              </option>
            ))}
          </select>
          <p className="text-small text-muted">
            {habit?.requiresPhoto
              ? "Tu amigo debe elegir un hábito con foto en vivo."
              : `${who === "tu amigo" ? "Tu amigo" : who} elige el suyo al aceptar.`}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-small text-ink">Frecuencia</p>
        <Segmented
          label="Frecuencia"
          value={type}
          onChange={setType}
          options={[
            { value: "daily", label: "Diario" },
            { value: "weekly", label: "Semanal" },
          ]}
        />
        {type === "weekly" ? (
          <Stepper label="Veces por semana" value={target} min={1} max={7} onChange={setTarget} />
        ) : null}
        <Stepper label="Duración en semanas" value={weeks} min={1} max={52} onChange={setWeeks} />
      </div>

      <Input
        label="Multa por falla (CLP)"
        name="fine"
        prefix="$"
        inputMode="numeric"
        autoComplete="off"
        placeholder="2.500"
        value={fine ? new Intl.NumberFormat("es-CL").format(Number(fine)) : ""}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 8);
          setFine(Number(digits) > MAX_FINE ? fine : digits);
        }}
        helper={fineAmount > 0 ? `Si no cumples, le debes ${fineShown} a ${who}.` : undefined}
      />

      <div className="flex items-start gap-3 rounded-md bg-field px-4 py-3">
        <Receipt size={20} weight="light" className="shrink-0 text-ink" aria-hidden />
        <p className="flex-1 text-small text-ink">
          {type === "weekly"
            ? `Cada semana que alguien no llegue a ${target}, le debe ${fineShown} al otro.`
            : `Cada día que alguien no cumpla, le debe ${fineShown} al otro.`}{" "}
          Si fallan los dos, se compensa. La app solo lo anota; no cobra ni paga.
        </p>
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-[6px] text-small text-ink">
          <Warning size={16} weight="light" className="mt-px shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={!valid || busy}>
        {valid ? <ArrowRight size={20} weight="light" aria-hidden /> : null}
        {valid ? `Enviar reto a ${who}` : "Enviar reto"}
      </Button>
    </form>
  );
}
