import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { monthTitle, type MonthKey } from "@/domain/calendar";

const button = "inline-flex size-11 shrink-0 items-center justify-center rounded-md";

/** Previous / next month for the detail views; never past the current month (`nextHref` null). */
export function MonthStepper({
  month,
  prevHref,
  nextHref,
}: {
  month: MonthKey;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const title = monthTitle(month);
  return (
    <nav aria-label="Mes" className="flex items-center gap-1">
      {prevHref ? (
        <Link href={prevHref} scroll={false} aria-label="Mes anterior" className={`${button} text-ink hover:bg-field`}>
          <CaretLeft size={20} weight="light" aria-hidden />
        </Link>
      ) : (
        <span aria-hidden className={`${button} text-outline-strong opacity-60`}>
          <CaretLeft size={20} weight="light" />
        </span>
      )}
      <h2
        aria-live="polite"
        className="flex min-w-0 flex-1 items-baseline justify-center gap-2 text-[17px] font-semibold tracking-[-0.02em] text-ink"
      >
        {title.name} <span className="font-mono text-[15px] font-medium tracking-normal text-muted">{title.year}</span>
      </h2>
      {nextHref ? (
        <Link href={nextHref} scroll={false} aria-label="Mes siguiente" className={`${button} text-ink hover:bg-field`}>
          <CaretRight size={20} weight="light" aria-hidden />
        </Link>
      ) : (
        <span aria-hidden className={`${button} text-outline-strong opacity-60`}>
          <CaretRight size={20} weight="light" />
        </span>
      )}
    </nav>
  );
}
