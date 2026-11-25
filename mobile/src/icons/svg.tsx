import { Image } from "expo-image";
import { PHOSPHOR_PATHS, type PhosphorName, type PhosphorWeight } from "./phosphor.generated";

/**
 * Vector art without react-native-svg (a native module, which would force a new APK): the SVG is built as a string and
 * drawn by expo-image, which already ships with SVG support. Base64, because Glide (Android) only loads base64 data urls.
 */
export function svgDataUri(xml: string): string {
  return `data:image/svg+xml;base64,${btoa(xml)}`;
}

type SvgProps = { xml: string; width: number; height: number; label?: string; testID?: string };

/** An inline SVG. Decorative unless it has a `label`. */
export function SvgImage({ xml, width, height, label, testID }: SvgProps) {
  return (
    <Image
      testID={testID}
      source={{ uri: svgDataUri(xml) }}
      style={{ width, height }}
      contentFit="contain"
      accessible={label !== undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={label === undefined}
      importantForAccessibility={label === undefined ? "no-hide-descendants" : "yes"}
    />
  );
}

const isName = (n: string): n is PhosphorName => n in PHOSPHOR_PATHS;

/** A Phosphor icon (256 grid) filled with `color`. An unknown name draws the target icon, as the web does. */
export function iconXml(name: string, weight: PhosphorWeight, color: string): string {
  const d = PHOSPHOR_PATHS[isName(name) ? name : "target"][weight];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path fill="${color}" d="${d}"/></svg>`;
}

type IconProps = { name: string; color: string; size?: number; weight?: PhosphorWeight; testID?: string };

export function PhosphorIcon({ name, color, size = 20, weight = "light", testID }: IconProps) {
  return <SvgImage testID={testID} xml={iconXml(name, weight, color)} width={size} height={size} />;
}

const R = 16;
const C = 2 * Math.PI * R;

/** The web ProgressRing (36 px, 4 px stroke, round cap), starting at 12 o'clock. */
export function ringXml({ pct, track, color }: { pct: number; track: string; color: string }): string {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><g transform="rotate(-90 18 18)">` +
    `<circle cx="18" cy="18" r="${R}" fill="none" stroke-width="4" stroke="${track}"/>` +
    `<circle cx="18" cy="18" r="${R}" fill="none" stroke-width="4" stroke-linecap="round" stroke="${color}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p / 100)}"/>` +
    `</g></svg>`
  );
}
