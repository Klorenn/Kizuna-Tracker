import type { CSSProperties } from "react";
import { CAT_LIFT, catAnimationStyle } from "./cat-animation";

export { CAT_LIFT };

/** Lift cat crop (kept for existing callers); see cat-animation.ts. */
export function catLiftStyle(width: number): CSSProperties {
  return catAnimationStyle("lift", width);
}
