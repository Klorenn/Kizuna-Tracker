import Link from "next/link";

/** Mono caps label with an optional accent action. */
export function SectionHeader({
  label,
  action,
  href,
}: {
  label: string;
  action?: string;
  href?: string;
}) {
  return (
    <div className="section-label flex h-6 items-center gap-2">
      <p className="min-w-0 flex-1 text-muted">{label}</p>
      {action ? (
        href ? (
          <Link href={href} className="shrink-0 text-accent">
            {action}
          </Link>
        ) : (
          <p className="shrink-0 text-accent">{action}</p>
        )
      ) : null}
    </div>
  );
}
