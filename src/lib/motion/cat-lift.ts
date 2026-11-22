import type { CSSProperties } from "react";

/*
 * public/brand/cat-lift.gif: 360 x 360 canvas, frames ~195 x 214; across all 60 frames the cat
 * stays inside the box 235 x 239 at (68, 45). cat-lift-still.png is frame 0 trimmed to
 * 195 x 214, which sits at (91, 70) on that canvas.
 */
export const CAT_LIFT = {
  gif: "/brand/cat-lift.gif",
  still: "/brand/cat-lift-still.png",
  canvas: 360,
  box: { x: 68, y: 45, w: 235, h: 239 },
  stillBox: { x: 91, y: 70, w: 195, h: 214 },
  /** one full pass of the GIF (it loops forever by itself): after this the cat rests on the still */
  playMs: 6000,
} as const;

/** CSS custom properties consumed by `.cat-lift-mask` (globals.css), cropped to the cat's box. */
export function catLiftStyle(width: number): CSSProperties {
  const { box, stillBox, canvas } = CAT_LIFT;
  const s = width / box.w;
  const px = (n: number) => `${Math.round(n * s * 100) / 100}px`;
  return {
    width,
    height: Math.round(box.h * s),
    "--cat-mask-size": `${px(canvas)} ${px(canvas)}`,
    "--cat-mask-pos": `${px(-box.x)} ${px(-box.y)}`,
    "--cat-still-size": `${px(stillBox.w)} ${px(stillBox.h)}`,
    "--cat-still-pos": `${px(stillBox.x - box.x)} ${px(stillBox.y - box.y)}`,
  } as CSSProperties;
}
