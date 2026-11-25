import { SvgImage } from "../icons/svg";
import { KANJI_PATHS, KANJI_VIEWBOX, WORDMARK_PATHS, WORDMARK_VIEWBOX } from "./brand-paths.generated";

const WORD_W = 129.82;
const WORD_H = 22.2857;

/** KIZUNA wordmark (the web `Wordmark`) as an SVG string, painted in `color`. */
export function wordmarkXml(color: string): string {
  const paths = WORDMARK_PATHS.map((d) => `<path d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORDMARK_VIEWBOX}"><g fill="${color}">${paths}</g></svg>`;
}

/** The web `Seal`: hanko-red rounded square (radius 11.7 %) with the kanji at 67 % x 75 % of it, in white. */
export function sealXml(): string {
  const [, , kw] = KANJI_VIEWBOX.split(" ").map(Number);
  const w = 67.21;
  const scale = w / kw;
  const paths = KANJI_PATHS.map((d) => `<path d="${d}"/>`).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="11.7" fill="#C73E2E"/>` +
    `<g transform="translate(${(100 - w) / 2} 12.5) scale(${scale})" fill="#ffffff">${paths}</g></svg>`
  );
}

export function Wordmark({ color, width = 130 }: { color: string; width?: number }) {
  return <SvgImage xml={wordmarkXml(color)} width={width} height={(width * WORD_H) / WORD_W} label="Kizuna" />;
}

export function Seal({ size = 29 }: { size?: number }) {
  return <SvgImage xml={sealXml()} width={size} height={size} label="絆" />;
}
