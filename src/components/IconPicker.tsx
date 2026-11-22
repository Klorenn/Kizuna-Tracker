"use client";

import { HABIT_ICONS, type IconKey } from "@/domain/presets";
import { HabitIcon } from "./habit-icon";

export function IconPicker({
  value,
  onChange,
}: {
  value: IconKey;
  onChange: (v: IconKey) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Ícono" className="grid grid-cols-6 gap-2">
      {HABIT_ICONS.map((name) => {
        const selected = name === value;
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={name}
            onClick={() => onChange(name)}
            className={`flex h-11 items-center justify-center rounded-md ${
              selected
                ? "border-[1.5px] border-accent bg-accent-soft text-accent"
                : "bg-field text-ink"
            }`}
          >
            <HabitIcon name={name} />
          </button>
        );
      })}
    </div>
  );
}
