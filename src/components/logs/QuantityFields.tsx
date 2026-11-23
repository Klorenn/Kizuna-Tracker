"use client";

import { useRef, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { goalIssue, parseTypedAmount, parseTypedAmountResult, resolveTarget, type GoalIssue } from "@/lib/quantity-queue";
import {
  MAX_QUANTITY_LABEL,
  validateQuantityConfig,
  type QuantityConfig,
} from "@/domain/quantity";

/**
 * Form fields of a quantity habit: unit, label (custom unit), daily goal, glass size and quick-add.
 *
 * Props (plain):
 * - value: the current `QuantityConfig` (amounts in base units: ml for water, even when shown as glasses).
 * - onChange(next): called on every edit with the new config. A field that does not parse is sent as
 *   NaN, so `validateHabitDraft` / `validateQuantityConfig` refuse the draft instead of saving stale data.
 * - lockedReason: when set (the habit is in a challenge) the unit and label are disabled, the goal
 *   cannot go below its starting value, and the reason is shown. A goal typed below that value stays
 *   visible but is sent as NaN, so the draft is refused (never clamped silently).
 */
export function QuantityFields({
  value,
  onChange,
  lockedReason,
  onGoalIssue,
}: {
  value: QuantityConfig;
  onChange: (next: QuantityConfig) => void;
  lockedReason?: string | null;
  /** Why the goal cannot be saved (not a number, or below the locked value); null when it can. */
  onGoalIssue?: (issue: GoalIssue) => void;
}) {
  type UnitKey = "ml" | "glasses" | "steps" | "km" | "times" | "minutes" | "custom";
  const unitKey: UnitKey = value.unit === "ml" && value.display === "glasses" ? "glasses" : value.unit;
  const locked = Boolean(lockedReason);
  const minTarget = useRef(value.target).current;
  const lockedMin = locked ? minTarget : null;

  const fieldText = (n: number, c: QuantityConfig) =>
    String(c.display === "glasses" ? Math.round((n / c.glassMl) * 100) / 100 : n).replace(".", ",");
  const [target, setTarget] = useState(fieldText(value.target, value));
  const [step, setStep] = useState(fieldText(value.step, value));
  const [glass, setGlass] = useState(String(value.glassMl));

  const UNITS: { key: UnitKey; label: string; make: () => Partial<QuantityConfig> & Pick<QuantityConfig, "unit" | "target" | "step"> }[] = [
    { key: "ml", label: "ml", make: () => ({ unit: "ml", target: 2000, step: 250, display: "base" }) },
    { key: "glasses", label: "Vasos", make: () => ({ unit: "ml", target: 2000, step: 250, display: "glasses", glassMl: 250 }) },
    { key: "steps", label: "Pasos", make: () => ({ unit: "steps", target: 8000, step: 1000, display: "base" }) },
    { key: "km", label: "km", make: () => ({ unit: "km", target: 5, step: 1, display: "base" }) },
    { key: "times", label: "Veces", make: () => ({ unit: "times", target: 3, step: 1, display: "base" }) },
    { key: "minutes", label: "Minutos", make: () => ({ unit: "minutes", target: 30, step: 10, display: "base" }) },
    { key: "custom", label: "Otra", make: () => ({ unit: "custom", target: 10, step: 1, display: "base" }) },
  ];

  function pickUnit(key: UnitKey) {
    const u = UNITS.find((x) => x.key === key);
    if (!u || locked || key === unitKey) return;
    const next: QuantityConfig = {
      label: u.key === "custom" ? "" : null,
      glassMl: 250,
      display: "base",
      ...u.make(),
    } as QuantityConfig;
    setTarget(fieldText(next.target, next));
    setStep(fieldText(next.step, next));
    setGlass(String(next.glassMl));
    onGoalIssue?.(null);
    onChange(next);
  }

  const emit = (patch: Partial<QuantityConfig>) => onChange({ ...value, ...patch });

  const editTarget = (raw: string) => {
    setTarget(raw);
    onGoalIssue?.(goalIssue(raw, value, lockedMin));
    emit({ target: resolveTarget(raw, value, lockedMin) });
  };
  const editStep = (raw: string) => {
    setStep(raw);
    emit({ step: parseTypedAmount(raw, value) ?? NaN });
  };
  const editGlass = (raw: string) => {
    setGlass(raw);
    const ml = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
    // the goal and the step keep their typed value in glasses: re-read them with the new glass size
    const next = { ...value, glassMl: ml };
    onGoalIssue?.(goalIssue(target, next, lockedMin));
    emit({
      glassMl: ml,
      target: resolveTarget(target, next, lockedMin),
      step: parseTypedAmount(step, next) ?? NaN,
    });
  };

  const checked = validateQuantityConfig(value);
  const typedTarget = parseTypedAmount(target, value);
  const targetParse = parseTypedAmountResult(target, value);
  const stepParse = parseTypedAmountResult(step, value);
  // the lock reason only for a valid number below the locked value; text that is not a number gets the invalid-number message
  const belowLock = locked && typedTarget !== null && typedTarget < minTarget;
  const targetError = !targetParse.ok ? targetParse.error : belowLock ? (lockedReason ?? null) : !checked.ok && /meta debe|meta no/i.test(checked.error) ? checked.error : null;
  const stepError = !stepParse.ok ? stepParse.error : !checked.ok && /suma rápida/i.test(checked.error) ? checked.error : null;
  const glassError = !checked.ok && /vaso/i.test(checked.error) && value.display === "glasses" ? checked.error : null;
  const labelError = !checked.ok && /unidad/i.test(checked.error) && value.unit === "custom" ? checked.error : null;

  const inGlasses = value.display === "glasses";
  const unitWord = inGlasses ? "vasos" : value.unit === "custom" ? "" : undefined;

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2" disabled={locked}>
        <legend className="mb-2 text-small text-ink">Unidad</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Unidad">
          {UNITS.map((u) => (
            <Chip
              key={u.key}
              selected={u.key === unitKey}
              onClick={() => pickUnit(u.key)}
              className={locked ? "opacity-60" : ""}
            >
              {u.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      {value.unit === "custom" ? (
        <Input
          label="Nombre de la unidad"
          name="quantity-label"
          maxLength={MAX_QUANTITY_LABEL}
          autoComplete="off"
          disabled={locked}
          value={value.label ?? ""}
          onChange={(e) => emit({ label: e.target.value })}
          error={labelError}
          helper="Hasta 12 caracteres, por ejemplo «páginas»."
        />
      ) : null}

      <Input
        label={`Meta diaria${inGlasses ? " (vasos)" : unitWord ? ` (${unitWord})` : ""}`}
        name="quantity-target"
        inputMode="decimal"
        autoComplete="off"
        className="font-mono"
        value={target}
        onChange={(e) => editTarget(e.target.value)}
        error={targetError}
      />

      {inGlasses ? (
        <Input
          label="Tamaño del vaso (ml)"
          name="quantity-glass"
          inputMode="numeric"
          autoComplete="off"
          className="font-mono"
          value={glass}
          onChange={(e) => editGlass(e.target.value)}
          error={glassError}
        />
      ) : null}

      <Input
        label={`Suma rápida${inGlasses ? " (vasos)" : ""}`}
        name="quantity-step"
        inputMode="decimal"
        autoComplete="off"
        className="font-mono"
        value={step}
        onChange={(e) => editStep(e.target.value)}
        error={stepError}
      />

      {locked ? <p className="text-small text-pretty text-muted">{lockedReason}</p> : null}
    </div>
  );
}
