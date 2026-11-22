import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { BrandHeader } from "@/components/brand/Logo";

const backClass =
  "-ml-3 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink transition-colors duration-[120ms] ease-[cubic-bezier(.2,0,0,1)] hover:bg-field active:bg-ink-soft";

/**
 * Cabecera de las pantallas de cuenta: marca compacta y, debajo, la fila de Figma
 * (atrás 44 px · barra de progreso 4 px · "PASO n DE 5").
 */
export function AuthTopBar({
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
    <header className="flex flex-col gap-2 pt-[max(env(safe-area-inset-top),12px)]">
      <BrandHeader />
      <div className="flex w-full items-center gap-3">
        {backHref ? (
          <Link href={backHref} aria-label="Atrás" className={backClass}>
            {icon}
          </Link>
        ) : (
          <button type="button" aria-label="Atrás" onClick={onBack} className={backClass}>
            {icon}
          </button>
        )}
        {step ? (
          <>
            <div
              role="progressbar"
              aria-label="Progreso del registro"
              aria-valuemin={1}
              aria-valuemax={total}
              aria-valuenow={step}
              aria-valuetext={`Paso ${step} de ${total}`}
              className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-1 origin-left rounded-[2px] bg-accent transition-transform duration-200 ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none"
                style={{ transform: `scaleX(${step / total})` }}
              />
            </div>
            <p className="section-label shrink-0 tabular-nums text-muted" aria-hidden>
              Paso {step} de {total}
            </p>
          </>
        ) : null}
      </div>
    </header>
  );
}
