import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { IconButton } from "./IconButton";

/** Back button with an optional step progress bar and "PASO n DE total" counter. */
export function TopBar({
  onBack,
  backHref,
  step,
  total = 5,
}: {
  onBack?: () => void;
  backHref?: string;
  step?: number;
  total?: number;
}) {
  const icon = <CaretLeft size={20} weight="light" aria-hidden />;
  return (
    <div className="flex w-full items-center gap-3">
      {backHref ? (
        <Link
          href={backHref}
          aria-label="Atrás"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-field"
        >
          {icon}
        </Link>
      ) : (
        <IconButton label="Atrás" onClick={onBack}>
          {icon}
        </IconButton>
      )}
      {step ? (
        <>
          <div
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={step}
            className="h-1 flex-1 overflow-hidden rounded-full bg-line"
          >
            <div
              className="h-1 rounded-[2px] bg-accent transition-[width] duration-200"
              style={{ width: `${(step / total) * 100}%` }}
            />
          </div>
          <p className="section-label text-muted">
            Paso {step} de {total}
          </p>
        </>
      ) : null}
    </div>
  );
}
