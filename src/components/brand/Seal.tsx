import { KANJI_VIEWBOX, KanjiPaths } from "./Kanji";

/** Sello hanko shu con 絆. El shu vive solo aquí. */
export function Seal({
  size = 29,
  decorative = false,
}: {
  size?: number;
  /** true when a neighbouring element already names the brand. */
  decorative?: boolean;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center text-on-accent"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.117,
        background: "#C73E2E",
      }}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "絆" })}
    >
      <svg
        width={size * 0.6721}
        height={size * 0.75}
        viewBox={KANJI_VIEWBOX}
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <KanjiPaths />
      </svg>
    </span>
  );
}
