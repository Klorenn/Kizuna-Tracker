import type { ComponentProps, ReactNode } from "react";

export function Chip({
  selected = false,
  icon,
  className = "",
  children,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  selected?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-small font-medium transition-colors duration-[120ms] ${
        selected
          ? "border-[1.5px] border-accent bg-accent-soft px-[10.5px] text-accent"
          : "bg-field text-ink"
      } ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
