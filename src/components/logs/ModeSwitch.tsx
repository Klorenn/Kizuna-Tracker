"use client";

import { useRef, type ReactNode } from "react";
import type { TimerMode } from "@/domain/pomodoro";

/*
 * ModeSwitch: the segmented control of "Medir tiempo" (Pomodoro · Temporizador · Cronómetro).
 *
 *   <ModeSwitch value locked onChange />
 *   - locked: a session is running, so the mode cannot change: every option is aria-disabled and
 *     the hint explains why. The hint line is always reserved, so nothing below it moves.
 *
 * A radio group with a roving tab stop: Tab reaches the selected option, the arrow keys (and Home /
 * End) move the selection and the focus. The focus ring comes from the global :focus-visible rule.
 */

export const MODE_OPTIONS: readonly { value: TimerMode; label: string }[] = [
  { value: "pomodoro", label: "Pomodoro" },
  { value: "timer", label: "Temporizador" },
  { value: "stopwatch", label: "Cronómetro" },
];

export const LOCKED_HINT = "Termina la sesión para cambiar de modo.";

/** The mode a key moves to from `current`, or null when the key does nothing here. */
export function nextMode(current: TimerMode, key: string): TimerMode | null {
  const i = MODE_OPTIONS.findIndex((o) => o.value === current);
  const n = MODE_OPTIONS.length;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return MODE_OPTIONS[(i + 1) % n].value;
    case "ArrowLeft":
    case "ArrowUp":
      return MODE_OPTIONS[(i + n - 1) % n].value;
    case "Home":
      return MODE_OPTIONS[0].value;
    case "End":
      return MODE_OPTIONS[n - 1].value;
    default:
      return null;
  }
}

export function ModeSwitch({
  value,
  locked,
  onChange,
  trailing,
}: {
  value: TimerMode;
  locked: boolean;
  onChange: (mode: TimerMode) => void;
  /** Sits at the end of the hint row (the mute button). */
  trailing?: ReactNode;
}) {
  const refs = useRef<Partial<Record<TimerMode, HTMLButtonElement | null>>>({});
  return (
    <div className="flex flex-col">
      <div role="radiogroup" aria-label="Modo" aria-describedby="mode-hint" className="flex gap-1 rounded-md bg-field p-1">
        {MODE_OPTIONS.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[o.value] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={locked || undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                if (!locked && !selected) onChange(o.value);
              }}
              onKeyDown={(e) => {
                const next = nextMode(value, e.key);
                if (next === null) return;
                e.preventDefault();
                if (locked) return;
                onChange(next);
                refs.current[next]?.focus();
              }}
              className={`h-11 min-w-0 flex-1 truncate rounded-md px-1 text-small font-medium transition-colors duration-[120ms] ${
                selected ? "bg-raised text-ink shadow-card" : "text-muted"
              } ${locked ? "cursor-not-allowed" : ""}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {/* the hint line is always there (a no-break space keeps its height), so nothing below moves */}
      <div className="flex min-h-11 items-center gap-2">
        <p id="mode-hint" className="min-w-0 flex-1 text-small text-pretty text-muted">
          {locked ? LOCKED_HINT : "\u00a0"}
        </p>
        {trailing}
      </div>
    </div>
  );
}
