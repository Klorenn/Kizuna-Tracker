import { CaretLeft, Info } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

export const LEGAL_DRAFT_NOTICE = "Borrador pendiente de revisión legal";

export type LegalSection = { title: string; body: ReactNode[] };

/** Shared shell for /legal/*: draft notice, title, numbered sections and a link to the sibling page. */
export function LegalPage({
  title,
  updated,
  sections,
  other,
}: {
  title: string;
  updated: string;
  sections: LegalSection[];
  other: { href: string; label: string };
}) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-10 pt-1">
      <Link href="/" className="flex h-11 items-center gap-1 text-[17px] text-accent">
        <CaretLeft size={20} weight="light" aria-hidden />
        Kizuna
      </Link>
      <h1 className="text-display font-semibold text-ink">{title}</h1>
      <p
        role="note"
        className="flex items-start gap-2 rounded-md bg-accent-soft px-4 py-3 text-small text-ink"
      >
        <Info size={16} weight="light" className="mt-px shrink-0" aria-hidden />
        <span>
          <strong className="font-medium">{LEGAL_DRAFT_NOTICE}</strong>. Este texto puede cambiar antes
          del lanzamiento.
        </span>
      </p>
      <p className="font-mono text-small text-muted">Última actualización: {updated}</p>
      {sections.map((s, i) => (
        <section key={s.title} aria-labelledby={`sec-${i}`} className="flex flex-col gap-2">
          <h2 id={`sec-${i}`} className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
            {i + 1}. {s.title}
          </h2>
          {s.body.map((p, j) => (
            <p key={j} className="text-body text-pretty text-muted">
              {p}
            </p>
          ))}
        </section>
      ))}
      <Link href={other.href} className="text-small text-accent">
        {other.label}
      </Link>
    </main>
  );
}
