"use client";

import { Minus, Plus } from "@phosphor-icons/react";

/** Same control as the challenge form's stepper: label, minus, value (mono), plus; 44 px targets. */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  errorId,
}: {
  /** Id of the error line shown for this control (sets aria-describedby and aria-invalid). */
  errorId?: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const btn =
    "inline-flex size-11 items-center justify-center rounded-full border border-outline-strong bg-surface text-ink disabled:opacity-40";
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label} aria-describedby={errorId}>
      <p className="flex-1 text-body text-ink">{label}</p>
      <button type="button" className={btn} aria-label={`Menos: ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus size={20} weight="light" aria-hidden />
      </button>
      <p aria-live="polite" className="min-w-4 text-center font-mono text-body font-medium text-ink">
        {value}
      </p>
      <button type="button" className={btn} aria-label={`Más: ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus size={20} weight="light" aria-hidden />
      </button>
    </div>
  );
}
