import type { CSSProperties } from "react";

/*
 * public/brand/cat-lift.gif: 360 × 360 canvas, frames ~195 × 214; across all 60 frames the cat
 * stays inside the box 235 × 239 at (68, 45). cat-lift-still.png is frame 0 trimmed to
 * 195 × 214, which sits at (91, 70) on that canvas.
 */
const BOX = { x: 68, y: 45, w: 235, h: 239 };
const CANVAS = 360;
const STILL = { x: 91, y: 70, w: 195, h: 214 };

/**
 * The owner's animated cat (GIF), tinted indigo through a CSS mask and cropped to the cat's
 * bounding box so `width` is the cat's real width. With prefers-reduced-motion the mask
 * switches to the still frame (.cat-lift-mask in globals.css).
 */
export function CatLift({ width = 172, className = "" }: { width?: number; className?: string }) {
  const s = width / BOX.w;
  const px = (n: number) => `${Math.round(n * s * 100) / 100}px`;
  const style = {
    width,
    height: Math.round(BOX.h * s),
    "--cat-mask-size": `${px(CANVAS)} ${px(CANVAS)}`,
    "--cat-mask-pos": `${px(-BOX.x)} ${px(-BOX.y)}`,
    "--cat-still-size": `${px(STILL.w)} ${px(STILL.h)}`,
    "--cat-still-pos": `${px(STILL.x - BOX.x)} ${px(STILL.y - BOX.y)}`,
  } as CSSProperties;
  return (
    <span
      aria-hidden="true"
      className={`cat-lift-mask inline-block shrink-0 bg-accent ${className}`}
      style={style}
    />
  );
}
