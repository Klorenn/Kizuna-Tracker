import type { CSSProperties } from "react";

/*
 * Owner's cat GIFs. Each is rendered as a luminance CSS mask cropped to the cat's union bounding
 * box (across every frame), so `width` is the cat's real width. The still PNG is the frame shown
 * at rest and under prefers-reduced-motion; `stillBox` is where it sits on the GIF canvas.
 *
 * - lift: 360 x 360 canvas, 60 frames; cat box 235 x 239 at (68, 45). The still is frame 0
 *   trimmed to 195 x 214, which sits at (91, 70).
 * - jump: 720 x 720 canvas, 73 frames x 80 ms; cat box 465 x 589 at (159, 78). The still is the
 *   full coalesced frame 0.
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

export const CAT_JUMP = {
  gif: "/brand/cat-jump.gif",
  still: "/brand/cat-jump-still.png",
  canvas: 720,
  box: { x: 159, y: 78, w: 465, h: 589 },
  stillBox: { x: 0, y: 0, w: 720, h: 720 },
  playMs: 5840,
} as const;

export const CAT_ASSETS = { lift: CAT_LIFT, jump: CAT_JUMP } as const;
export type CatAsset = keyof typeof CAT_ASSETS;

/** CSS custom properties consumed by `.cat-mask` (globals.css), cropped to the cat's box. */
export function catAnimationStyle(asset: CatAsset, width: number): CSSProperties {
  const { box, stillBox, canvas, gif, still } = CAT_ASSETS[asset];
  const s = width / box.w;
  const px = (n: number) => `${Math.round(n * s * 100) / 100}px`;
  return {
    width,
    height: Math.round(box.h * s),
    "--cat-gif": `url(${gif})`,
    "--cat-still": `url(${still})`,
    "--cat-mask-size": `${px(canvas)} ${px(canvas)}`,
    "--cat-mask-pos": `${px(-box.x)} ${px(-box.y)}`,
    "--cat-still-size": `${px(stillBox.w)} ${px(stillBox.h)}`,
    "--cat-still-pos": `${px(stillBox.x - box.x)} ${px(stillBox.y - box.y)}`,
  } as CSSProperties;
}
