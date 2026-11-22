"use client";

import type { ReactNode } from "react";

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string; leading?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-1 rounded-md bg-field p-1"
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
            className={`h-11 min-w-0 flex-1 rounded-md px-3 text-[14px] font-medium transition-colors duration-[120ms] ${
              selected ? "bg-raised text-ink shadow-card" : "text-muted"
            }`}
          >
            {o.leading ? (
              <span className="flex min-w-0 items-center justify-center gap-1.5">
                {o.leading}
                <span className="truncate">{o.label}</span>
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
