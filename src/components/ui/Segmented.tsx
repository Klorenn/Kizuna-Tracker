"use client";

import type { ReactNode } from "react";

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  fit = "equal",
}: {
  label: string;
  options: readonly { value: T; label: string; leading?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  /** equal shares the row. content keeps each label whole and scrolls sideways. */
  fit?: "equal" | "content";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex gap-1 rounded-md bg-field p-1 ${fit === "content" ? "overflow-x-auto" : ""}`}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`h-11 rounded-md px-3 text-[14px] font-medium transition-colors duration-[120ms] ${
              fit === "content" ? "shrink-0" : "min-w-0 flex-1"
            } ${selected ? "bg-raised text-ink shadow-card" : "text-muted"}`}
          >
            {o.leading ? (
              <span className={`flex items-center justify-center gap-1.5 ${fit === "content" ? "" : "min-w-0"}`}>
                {o.leading}
                <span className={fit === "content" ? undefined : "truncate"}>{o.label}</span>
              </span>
            ) : (
              o.label
            )}
          </button>
        );
      })}
    </div>
  );
}
