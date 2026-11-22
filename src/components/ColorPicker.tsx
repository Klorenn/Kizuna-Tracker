"use client";

import { Check } from "@phosphor-icons/react/dist/ssr";
import { HABIT_COLORS, HABIT_COLOR_LABEL, type HabitColor } from "@/domain/habit-colors";

/**
 * Habit identity color: one row of 8 swatches (44 px targets). The selection is an accent ring
 * plus a check, and the chosen name is spelled out in the label, so it never relies on color.
 */
export function ColorPicker({ value, onChange }: { value: HabitColor; onChange: (v: HabitColor) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-small text-ink" id="habit-color-label">
        Color <span className="text-muted">· {HABIT_COLOR_LABEL[value]}</span>
      </p>
      {/* -mx-2 lets 8 cells reach 44 px inside the 20 px page gutter at 375 px */}
      <div role="radiogroup" aria-labelledby="habit-color-label" className="-mx-2 grid grid-cols-8">
        {HABIT_COLORS.map((color) => {
          const selected = color === value;
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={HABIT_COLOR_LABEL[color]}
              onClick={() => onChange(color)}
              data-habit-color={color}
              className="flex h-11 items-center justify-center rounded-full"
            >
              <span
                className={`flex size-8 items-center justify-center rounded-full bg-(--habit) text-(--habit-on) transition-shadow duration-[120ms] ${
                  selected ? "ring-2 ring-accent ring-offset-2 ring-offset-paper" : ""
                }`}
              >
                {selected ? <Check size={16} weight="bold" aria-hidden /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
