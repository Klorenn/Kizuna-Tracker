import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "./Card";

type RowContent = {
  icon?: ReactNode;
  label: ReactNode;
  /** Second line under the label (muted). */
  hint?: ReactNode;
  /** Right-aligned value (muted); `mono` for numbers, times and handles. */
  value?: ReactNode;
  mono?: boolean;
  /** Extra element before the chevron (a thumbnail, a small action). */
  trailing?: ReactNode;
  chevron?: boolean;
  /** "danger": alert-colored icon and label (Zona de peligro only). */
  tone?: "default" | "danger";
};

type RowProps = RowContent & {
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  "aria-label"?: string;
};

// every row draws its own hairline; ListCard hides the last one (so toasts, inputs or forms
// inside the card never add stray lines, which `divide-y` would)
const base = "flex min-h-[52px] w-full items-center gap-3 border-b border-line px-4 py-3 text-left";
const pressable =
  "transition-colors duration-[120ms] ease-[cubic-bezier(.2,0,0,1)] hover:bg-field active:bg-field focus-visible:outline-offset-[-2px] disabled:cursor-not-allowed disabled:hover:bg-transparent";

function Content({ icon, label, hint, value, mono, trailing, chevron, tone }: RowContent) {
  const danger = tone === "danger";
  return (
    <>
      {icon ? (
        <span aria-hidden className={`flex size-5 shrink-0 items-center justify-center ${danger ? "text-alert-text" : "text-ink"}`}>
          {icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-body ${danger ? "font-medium text-alert-text" : "text-ink"}`}>{label}</span>
        {hint ? <span className="text-small text-muted">{hint}</span> : null}
      </span>
      {value !== undefined && value !== null ? (
        <span
          className={`min-w-0 max-w-[58%] truncate text-right text-muted ${
            mono ? "font-mono text-[14px] font-medium" : "text-body"
          }`}
        >
          {value}
        </span>
      ) : null}
      {trailing}
      {chevron ? <CaretRight size={18} weight="light" aria-hidden className="-mr-1 shrink-0 text-muted" /> : null}
    </>
  );
}

/**
 * One row of a grouped list (Ajustes, Perfil): icon, label (+ hint), right-aligned value, chevron.
 * A link with `href`, a button with `onClick` or `type="submit"`, otherwise static.
 */
export function ListRow({ href, onClick, type, disabled, "aria-label": ariaLabel, ...content }: RowProps) {
  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel} className={`${base} ${pressable}`}>
        <Content {...content} />
      </Link>
    );
  }
  if (onClick || type) {
    return (
      <button type={type ?? "button"} onClick={onClick} disabled={disabled} aria-label={ariaLabel} className={`${base} ${pressable}`}>
        <Content {...content} />
      </button>
    );
  }
  return (
    <div className={base}>
      <Content {...content} />
    </div>
  );
}

/** Card for ListRows: the -1px bottom margin tucks the last row's hairline under the card edge. */
export function ListCard({ children }: { children: ReactNode }) {
  return (
    <Card>
      <div className="-mb-px">{children}</div>
    </Card>
  );
}

/** Mono caps label, hairline-separated rows on one card, optional footnote. */
export function ListSection({
  id,
  label,
  footer,
  children,
}: {
  id: string;
  label: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="section-label text-muted">
        {label}
      </h2>
      <ListCard>{children}</ListCard>
      {footer ? <p className="text-small text-muted">{footer}</p> : null}
    </section>
  );
}
