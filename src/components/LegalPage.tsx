import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

export type LegalSection = { title: string; body: ReactNode[] };

/** Last-updated line and numbered sections. Used by the /legal/* pages and the in-app sheet. */
export function LegalBody({ updated, sections }: { updated: string; sections: LegalSection[] }) {
  return (
    <div className="flex flex-col gap-4">
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
    </div>
  );
}

/** Shell for /legal/*: back link, title, content and a link to the sibling page. */
export function LegalPage({
  title,
  children,
  other,
}: {
  title: string;
  children: ReactNode;
  other: { href: string; label: string };
}) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pb-10 pt-1">
      <Link href="/" className="flex h-11 items-center gap-1 text-[17px] text-accent">
        <CaretLeft size={20} weight="light" aria-hidden />
        Kizuna
      </Link>
      <h1 className="text-display font-semibold text-ink">{title}</h1>
      {children}
      <Link href={other.href} className="text-small text-accent">
        {other.label}
      </Link>
    </main>
  );
}
