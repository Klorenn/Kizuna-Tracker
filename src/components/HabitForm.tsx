"use client";

import { Minus, Plus, Warning, X } from "@phosphor-icons/react/dist/ssr";
import { radioKeyTarget } from "@/lib/radio-keys";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createHabit, updateHabit } from "@/app/(app)/habitos/actions";
import {
  MAX_ITEMS,
  PRESETS,
  PRESET_KEYS,
  customDraft,
  presetDraft,
  validateHabitDraft,
  type HabitDraft,
  type PresetKey,
} from "@/domain/presets";
import { LOG_TYPES, LOG_TYPE_LABEL, type LogType } from "@/domain/logs";
import type { QuantityConfig } from "@/domain/quantity";
import { ColorPicker } from "./ColorPicker";
import { IconPicker } from "./IconPicker";
import { VisibilityPicker } from "./VisibilityPicker";
import { HabitIcon } from "./habit-icon";
import { Button } from "./ui/Button";
import { Chip } from "./ui/Chip";
import { Input } from "./ui/Input";
import { Segmented } from "./ui/Segmented";
import { Toggle } from "./ui/Toggle";
import { QuantityFields } from "./logs/QuantityFields";

const CHIP_LABEL: Partial<Record<PresetKey, string>> = { gym: "Gym" };
const FREQUENCY = [
  { value: "daily", label: "Diaria" },
  { value: "weekly", label: "Veces por semana" },
] as const;
const LOG_TYPE_OPTIONS = LOG_TYPES.map((value) => ({ value, label: LOG_TYPE_LABEL[value] }));
const DEFAULT_QUANTITY: QuantityConfig = {
  unit: "ml",
  label: null,
  target: 2000,
  step: 250,
  display: "glasses",
  glassMl: 250,
};
const STEPS_NO_LOG = "Un hábito con pasos no lleva registro detallado.";
const PHOTO_NO_LOG = "Un hábito con foto no lleva tiempo ni cantidad.";
const LOG_TYPE_HINT: Record<LogType, string> = {
  none: "Solo marcas si lo hiciste.",
  reading: "Anotas el libro y las páginas de cada día.",
  workout: "Anotas el tipo de día, los ejercicios y los pesos.",
  time: "Anotas cuánto rato le dedicaste.",
  watch: "Anotas qué viste.",
  quantity: "Sumas hasta llegar a la meta diaria.",
  cardio: "Anotas distancia y tiempo.",
};

/** Create (with preset chips) or edit a habit. */
export function HabitForm({
  initial,
  habitId,
  quantityLockedReason = null,
}: {
  initial: HabitDraft;
  habitId?: string;
  /** Set when the habit is in a proposed or active challenge: the unit is fixed and the goal cannot go down. */
  quantityLockedReason?: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<HabitDraft>(initial);
  const [chosen, setChosen] = useState<PresetKey | "other" | null>(
    habitId ? null : "other",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editing = habitId !== undefined;
  const hasItems = draft.items.length > 0;
  const weeklyTarget = draft.frequency.type === "weekly" ? draft.frequency.target : 3;

  function patch(p: Partial<HabitDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }
  function pick(key: PresetKey | "other") {
    setChosen(key);
    setDraft(key === "other" ? customDraft() : presetDraft(key));
    setError(null);
  }
  // a locked quantity habit keeps its type (the database refuses leaving it)
  const lockedType = quantityLockedReason !== null && initial.logType === "quantity";
  // what the database refuses: steps with any log; a photo with time or quantity
  const logTypeOff = (t: LogType) =>
    (lockedType && t !== "quantity") ||
    (t !== "none" && (hasItems || (draft.requiresPhoto && (t === "time" || t === "quantity"))));
  function pickLogType(logType: LogType) {
    if (logTypeOff(logType)) return;
    patch({ logType, quantity: logType === "quantity" ? (draft.quantity ?? DEFAULT_QUANTITY) : draft.quantity });
  }
  function setItem(index: number, label: string) {
    patch({ items: draft.items.map((it, i) => (i === index ? { ...it, label } : it)) });
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const valid = validateHabitDraft(draft);
    if (!valid.ok) return setError(valid.error);
    setError(null);
    start(async () => {
      const result = editing ? await updateHabit(habitId, draft) : await createHabit(draft);
      if (!result.ok) return setError(result.error);
      router.push(editing ? `/habitos/${habitId}` : "/");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {!editing ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Hábitos predefinidos">
          {PRESET_KEYS.map((key) => (
            <Chip
              key={key}
              selected={chosen === key}
              icon={<HabitIcon name={PRESETS[key].icon} size={16} />}
              onClick={() => pick(key)}
            >
              {CHIP_LABEL[key] ?? PRESETS[key].name}
            </Chip>
          ))}
          <Chip
            selected={chosen === "other"}
            icon={<Plus size={16} weight="light" aria-hidden />}
            onClick={() => pick("other")}
          >
            Otro
          </Chip>
        </div>
      ) : null}

      <Input
        label="Nombre"
        name="name"
        value={draft.name}
        maxLength={60}
        placeholder="Practicar guitarra"
        onChange={(e) => patch({ name: e.target.value })}
      />

      <div className="flex flex-col gap-2">
        <p className="text-small text-ink">Ícono</p>
        <IconPicker value={draft.icon} onChange={(icon) => patch({ icon })} />
      </div>

      <ColorPicker value={draft.color} onChange={(color) => patch({ color })} />

      <div className="flex flex-col gap-2">
        <p className="text-small text-ink">Frecuencia</p>
        <Segmented
          label="Frecuencia"
          options={FREQUENCY}
          value={draft.frequency.type}
          onChange={(type) =>
            patch({
              frequency: type === "daily" ? { type: "daily" } : { type: "weekly", target: weeklyTarget },
            })
          }
        />
        {draft.frequency.type === "weekly" ? (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-body text-ink">Veces por semana</p>
            <button
              type="button"
              aria-label="Una vez menos"
              disabled={weeklyTarget <= 1}
              onClick={() => patch({ frequency: { type: "weekly", target: weeklyTarget - 1 } })}
              className="flex size-11 items-center justify-center rounded-full border border-outline-strong bg-surface disabled:opacity-40"
            >
              <Minus size={20} weight="light" aria-hidden />
            </button>
            <span className="font-mono text-body font-medium text-ink" aria-live="polite">
              {weeklyTarget}
            </span>
            <button
              type="button"
              aria-label="Una vez más"
              disabled={weeklyTarget >= 7}
              onClick={() => patch({ frequency: { type: "weekly", target: weeklyTarget + 1 } })}
              className="flex size-11 items-center justify-center rounded-full border border-outline-strong bg-surface disabled:opacity-40"
            >
              <Plus size={20} weight="light" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      {hasItems ? (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium text-ink">Foto en cada paso</p>
            <p className="text-small text-muted">
              {draft.visibility === "private"
                ? "Opcional."
                : "Opcional. Tus amigos verán las fotos."}
            </p>
          </div>
          <Toggle
            label="Foto en cada paso"
            checked={draft.items.every((i) => i.requiresPhoto)}
            onChange={(on) =>
              patch({ items: draft.items.map((i) => ({ ...i, requiresPhoto: on })) })
            }
          />
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium text-ink">Requiere foto</p>
            <p className="text-small text-muted">Pide una foto en vivo al marcarlo.</p>
          </div>
          <Toggle
            label="Requiere foto"
            checked={draft.requiresPhoto}
            onChange={(requiresPhoto) => patch({ requiresPhoto })}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-small">
          <p className="flex-1 text-ink">Pasos del día (opcional)</p>
          <p className="text-muted">{draft.items.length}</p>
        </div>
        <div className="flex flex-col rounded-lg border border-line bg-surface px-4">
          {draft.items.map((item, index) => (
            <div key={index} className="flex min-h-12 items-center gap-3 border-b border-line">
              <input
                aria-label={`Paso ${index + 1}`}
                value={item.label}
                maxLength={40}
                onChange={(e) => setItem(index, e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none"
              />
              <button
                type="button"
                aria-label={`Quitar ${item.label || `paso ${index + 1}`}`}
                onClick={() =>
                  patch({
                    items: draft.items.filter((_, i) => i !== index),
                    requiresPhoto: false,
                  })
                }
                className="flex size-11 -mr-3 items-center justify-center text-ink"
              >
                <X size={16} weight="light" aria-hidden />
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={draft.items.length >= MAX_ITEMS}
            onClick={() =>
              patch({
                items: [...draft.items, { label: "", requiresPhoto: false }],
                requiresPhoto: false,
                // a habit with steps does not carry a detailed log
                logType: "none",
              })
            }
            className="flex min-h-12 items-center gap-2 text-body text-accent disabled:opacity-40"
          >
            <Plus size={16} weight="light" aria-hidden />
            Agregar paso
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-small text-ink">Registro detallado</p>
        {/* Segmented look, but wrapping: seven options with long labels do not fit one row at 375 px */}
        <div
          role="radiogroup"
          aria-label="Registro detallado"
          className="flex flex-wrap gap-1 rounded-md bg-field p-1"
          onKeyDown={(e) => {
            const enabled = LOG_TYPE_OPTIONS.filter((o) => !logTypeOff(o.value));
            const at = enabled.findIndex((o) => o.value === draft.logType);
            const to = radioKeyTarget(e.key, Math.max(at, 0), enabled.length);
            if (to === null) return;
            e.preventDefault();
            pickLogType(enabled[to].value);
            const index = LOG_TYPE_OPTIONS.findIndex((o) => o.value === enabled[to].value);
            e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
          }}
        >
          {LOG_TYPE_OPTIONS.map((o) => {
            const selected = o.value === draft.logType;
            const off = logTypeOff(o.value);
            // roving tabindex over the enabled options: the selected one, else the first enabled
            const firstEnabled = LOG_TYPE_OPTIONS.find((x) => !logTypeOff(x.value));
            const anySelected = LOG_TYPE_OPTIONS.some((x) => x.value === draft.logType && !logTypeOff(x.value));
            const tab = !off && (selected || (!anySelected && o === firstEnabled));
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={off}
                tabIndex={tab ? 0 : -1}
                onClick={() => pickLogType(o.value)}
                className={`h-11 flex-auto rounded-md px-3 text-[14px] font-medium whitespace-nowrap transition-colors duration-[120ms] disabled:opacity-40 ${
                  selected ? "bg-raised text-ink shadow-card" : "text-muted"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <p className="text-small text-muted">
          {hasItems ? STEPS_NO_LOG : draft.requiresPhoto ? `${PHOTO_NO_LOG} ${LOG_TYPE_HINT[draft.logType]}` : LOG_TYPE_HINT[draft.logType]}
        </p>
        {draft.logType === "quantity" ? (
          <QuantityFields
            value={draft.quantity ?? DEFAULT_QUANTITY}
            onChange={(quantity) => patch({ quantity })}
            lockedReason={quantityLockedReason}
          />
        ) : null}
      </div>

      <VisibilityPicker value={draft.visibility} onChange={(visibility) => patch({ visibility })} />

      {error ? (
        <p role="alert" className="flex items-center gap-1 text-small text-ink">
          <Warning size={16} weight="light" className="shrink-0 text-alert" aria-hidden />
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {editing ? "Guardar cambios" : "Crear hábito"}
      </Button>
    </form>
  );
}
