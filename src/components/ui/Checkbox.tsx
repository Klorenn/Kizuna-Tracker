import { Check } from "@phosphor-icons/react/dist/ssr";
import type { ComponentProps, ReactNode } from "react";

/** 22 px box inside a 44 px touch row. */
export function Checkbox({
  label,
  className = "",
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label: ReactNode }) {
  return (
    <label className={`flex min-h-11 w-full cursor-pointer items-center gap-3 ${className}`}>
      <input type="checkbox" className="peer sr-only" {...props} />
      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-sm border border-outline-strong bg-surface text-on-accent peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100">
        <Check size={16} weight="bold" aria-hidden />
      </span>
      <span className="text-body text-ink">{label}</span>
    </label>
  );
}
