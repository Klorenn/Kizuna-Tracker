import { Check, Warning } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

/** Inline hint under a field: error (alert icon, ink text), ok (check) or muted. */
export function Hint({
  tone,
  id,
  children,
}: {
  tone: "ok" | "error" | "muted";
  id?: string;
  children: ReactNode;
}) {
  const Icon = tone === "error" ? Warning : Check;
  return (
    <p
      id={id}
      role={tone === "error" ? "alert" : undefined}
      className={`flex items-start gap-[6px] text-small text-pretty ${tone === "muted" ? "text-muted" : "text-ink"}`}
    >
      {tone === "muted" ? null : (
        <Icon
          size={16}
          weight="light"
          className={`mt-px shrink-0 ${tone === "error" ? "text-alert" : "text-ink"}`}
          aria-hidden
        />
      )}
      {children}
    </p>
  );
}
