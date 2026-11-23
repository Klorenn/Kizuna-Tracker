import Link from "next/link";

/**
 * A read failed: one quiet line and a retry link to the same page, shown instead of a number or a
 * list that would pass for "nothing yet" (a zero streak, no goals).
 */
export function LoadFailed({ href }: { href: string }) {
  return (
    <p role="status" className="flex flex-wrap items-center gap-x-2 text-small text-muted">
      <span>No pudimos cargar esto. Inténtalo de nuevo.</span>
      <Link href={href} prefetch={false} className="inline-flex min-h-11 items-center text-accent hover:underline">
        Reintentar
      </Link>
    </p>
  );
}
