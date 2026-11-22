import type { ComponentProps } from "react";
import type { HabitColor } from "@/domain/habit-colors";

/**
 * Surface card (radius 15, hairline, soft shadow). `accent` adds the 3 px left bar, in the
 * accent color or, with `accentColor`, in a habit's identity color.
 */
export function Card({
  accent = false,
  accentColor,
  className = "",
  children,
  ...props
}: ComponentProps<"div"> & { accent?: boolean; accentColor?: HabitColor }) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-line bg-surface shadow-card ${
        accent ? "pl-[3px]" : ""
      } ${className}`}
      {...props}
    >
      {accent ? (
        <span
          aria-hidden
          data-habit-color={accentColor}
          className={`absolute inset-y-0 left-0 w-[3px] ${accentColor ? "bg-(--habit)" : "bg-accent"}`}
        />
      ) : null}
      {children}
    </div>
  );
}
