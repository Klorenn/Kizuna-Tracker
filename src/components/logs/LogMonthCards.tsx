import { Lock } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { LogCard } from "@/lib/log-cards";
import { VALUE_BASE, valueSizeClass } from "@/lib/value-size";

/** Tappable month cards of the REGISTROS section: each opens its detail view. */
export function LogMonthCards({ cards }: { cards: LogCard[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <li key={c.key} className="min-w-0">
          <Link
            href={c.href}
            aria-label={`${c.label} ${c.value}. ${c.caption}${c.private ? ". Solo tú" : ""}`}
            className="flex h-full min-h-[44px] flex-col gap-1 rounded-lg border border-line bg-surface p-4 shadow-card transition-colors duration-[120ms] hover:bg-field active:bg-field"
          >
            <span className="flex items-center gap-1.5 text-small text-muted">
              {c.private ? <Lock size={14} weight="light" aria-hidden className="shrink-0" /> : null}
              <span className="truncate">{c.label}</span>
            </span>
            <span data-value className={`${VALUE_BASE} ${valueSizeClass(c.value)}`}>
              {c.value}
            </span>
            <span className="truncate text-small text-muted">{c.caption}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
