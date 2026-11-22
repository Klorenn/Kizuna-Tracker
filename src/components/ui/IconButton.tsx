import type { ComponentProps } from "react";

/** 44 px touch target around a 20 px icon. `label` is required for screen readers. */
export function IconButton({
  label,
  className = "",
  type = "button",
  children,
  ...props
}: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink transition-colors duration-[120ms] hover:bg-field ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
