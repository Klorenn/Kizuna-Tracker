import { Export, House, PlusSquare } from "@phosphor-icons/react/dist/ssr";

const STEPS = [
  { Icon: Export, text: "Toca Compartir en Safari" },
  { Icon: PlusSquare, text: 'Elige "Agregar a inicio"' },
  { Icon: House, text: "Abre Kizuna desde tu inicio" },
];

/** iPhone install instructions (InstallPrompt sheet and Ajustes > Notificaciones). */
export function InstallSteps() {
  return (
    <>
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={56} height={56} className="size-14 shrink-0 rounded-lg" />
        <p className="min-w-0 flex-1 text-body text-muted">
          En iPhone, los recordatorios solo llegan si Kizuna está en tu pantalla de inicio.
        </p>
      </div>
      <ol className="flex flex-col rounded-lg border border-line bg-surface px-4 shadow-card">
        {STEPS.map(({ Icon, text }, i) => (
          <li key={text} className="flex min-h-14 items-center gap-3 border-line [&:not(:last-child)]:border-b">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Icon size={20} weight="light" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-body text-ink">{text}</span>
            <span className="section-label text-muted">{String(i + 1).padStart(2, "0")}</span>
          </li>
        ))}
      </ol>
    </>
  );
}
