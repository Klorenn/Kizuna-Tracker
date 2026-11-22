import { Kanji } from "@/components/brand/Kanji";

const PLACEMENT = {
  /** Forms: in the empty band above the pinned action. */
  bottom: "-right-12 bottom-24 w-[260px]",
  /** Welcome: between the copy and the actions, bleeding off the right edge. */
  middle: "-right-16 top-[50%] w-[280px]",
} as const;

/**
 * 絆 a pincel, muy tenue (tinta al 3 %), detrás del contenido.
 * Decorativo: aria-hidden y sin eventos; se oculta en pantallas bajas (teclado abierto),
 * con contraste alto, transparencia reducida y forced-colors (.kanji-watermark en globals.css).
 */
export function KanjiWatermark({ placement = "bottom" }: { placement?: keyof typeof PLACEMENT }) {
  return (
    <div
      aria-hidden="true"
      className="kanji-watermark pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <Kanji className={`absolute h-auto text-ink/[0.03] ${PLACEMENT[placement]}`} />
    </div>
  );
}
