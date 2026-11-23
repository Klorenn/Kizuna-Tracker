"use client";

import { Minus } from "@phosphor-icons/react";
import { IconButton } from "@/components/ui/IconButton";
import type { SetFields } from "@/lib/workout-form";

const FIELD =
  "h-11 w-full min-w-0 rounded-md border border-outline-strong bg-paper px-3 text-center font-mono text-body text-ink caret-accent outline-none transition-[border-color,box-shadow] duration-[120ms] focus:border-accent focus:shadow-[inset_0_0_0_1px_var(--color-accent)] aria-[invalid=true]:border-alert";

/** One set: "1  [reps] × [kg] kg". Fields are text so a half-typed "42," is fine; the comma is shown. */
export function SetRow({
  index,
  exerciseName,
  value,
  onChange,
  onRemove,
  repsId,
  invalid,
  errorId,
}: {
  /** 1-based */
  index: number;
  exerciseName: string;
  value: SetFields;
  onChange: (next: SetFields) => void;
  /** Absent when it is the only set. */
  onRemove?: () => void;
  /** id of the reps input, so the logger can focus a new row. */
  repsId?: string;
  /** The field the last save attempt rejected; it gets aria-invalid and points at the error line. */
  invalid?: "reps" | "kg";
  errorId?: string;
}) {
  const a11y = (field: "reps" | "kg") =>
    invalid === field ? { "aria-invalid": true as const, "aria-describedby": errorId } : {};
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 shrink-0 text-right font-mono text-small text-muted" aria-hidden>
        {index}
      </span>
      <input
        id={repsId}
        {...a11y("reps")}
        aria-label={`Repeticiones de la serie ${index} de ${exerciseName}`}
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        placeholder="reps"
        value={value.reps}
        onChange={(e) => onChange({ ...value, reps: e.target.value.replace(/\D/g, "") })}
        className={`${FIELD} max-w-[84px]`}
      />
      <span aria-hidden className="text-body text-muted">
        ×
      </span>
      <input
        {...a11y("kg")}
        aria-label={`Peso en kilos de la serie ${index} de ${exerciseName}`}
        inputMode="decimal"
        autoComplete="off"
        maxLength={6}
        placeholder="kg"
        value={value.kg}
        onChange={(e) => onChange({ ...value, kg: e.target.value.replace(/[^\d.,]/g, "") })}
        className={`${FIELD} max-w-[104px]`}
      />
      <span className="text-small text-muted" aria-hidden>
        kg
      </span>
      <span className="ml-auto">
        {onRemove ? (
          <IconButton label={`Quitar la serie ${index} de ${exerciseName}`} onClick={onRemove}>
            <Minus size={20} weight="light" aria-hidden />
          </IconButton>
        ) : (
          <span className="block size-11" aria-hidden />
        )}
      </span>
    </div>
  );
}
