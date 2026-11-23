import Link from "next/link";

/** Inter semibold label with an optional accent action. `scroll={false}` keeps the scroll position. */
export function SectionHeader({
  label,
  action,
  href,
  scroll,
}: {
  label: string;
  action?: string;
  href?: string;
  scroll?: boolean;
}) {
  return (
    <div className="section-label flex h-6 items-center gap-2">
      <p className="min-w-0 flex-1 text-muted">{label}</p>
      {action ? (
        href ? (
          <Link href={href} scroll={scroll} className="-my-2.5 inline-flex h-11 shrink-0 items-center text-accent">
            {action}
          </Link>
        ) : (
          <p className="shrink-0 text-accent">{action}</p>
        )
      ) : null}
    </div>
  );
}
