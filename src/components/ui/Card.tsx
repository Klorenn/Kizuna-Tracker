import type { ComponentProps } from "react";

/** Surface card (radius 15, hairline, soft shadow). `accent` adds the 3 px left bar. */
export function Card({
  accent = false,
  className = "",
  children,
  ...props
}: ComponentProps<"div"> & { accent?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-line bg-surface shadow-card ${
        accent ? "pl-[3px]" : ""
      } ${className}`}
      {...props}
    >
      {accent ? (
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
      ) : null}
      {children}
    </div>
  );
}
