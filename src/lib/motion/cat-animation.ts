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

/** 720 x 720 canvas, 73 frames x 80 ms; cat box 350 x 429 at (160, 137). The still is the full frame 0. */
export const CAT_EAT = {
  gif: "/brand/cat-eat.gif",
  still: "/brand/cat-eat-still.png",
  canvas: 720,
  box: { x: 160, y: 137, w: 350, h: 429 },
  stillBox: { x: 0, y: 0, w: 720, h: 720 },
  playMs: 5840,
} as const;

export const CAT_ASSETS = { lift: CAT_LIFT, jump: CAT_JUMP, eat: CAT_EAT } as const;
export type CatAsset = keyof typeof CAT_ASSETS;

export type CatVariant = 'animated' | 'still'

/** Badges this small (GoalCard "Meta cumplida", "Ganaste este reto") show the still PNG only: no GIF fetch. */
export const STILL_MAX_WIDTH = 64

export function catVariantFor(width: number): CatVariant {
  return width <= STILL_MAX_WIDTH ? 'still' : 'animated'
}

/** Files a cat of that variant makes the browser fetch. */
export function catUrls(asset: CatAsset, variant: CatVariant): string[] {
  const { gif, still } = CAT_ASSETS[asset]
  return variant === 'still' ? [still] : [gif, still]
}

/** CSS custom properties consumed by `.cat-mask` (globals.css), cropped to the cat's box. A still cat never names the GIF. */
export function catAnimationStyle(asset: CatAsset, width: number, variant: CatVariant = 'animated'): CSSProperties {
  const { box, stillBox, canvas, gif, still } = CAT_ASSETS[asset]
  const s = width / box.w
  const px = (n: number) => `${Math.round(n * s * 100) / 100}px`
  return {
    width,
    height: Math.round(box.h * s),
    '--cat-gif': `url(${variant === 'still' ? still : gif})`,
    '--cat-still': `url(${still})`,
    '--cat-mask-size': `${px(canvas)} ${px(canvas)}`,
    '--cat-mask-pos': `${px(-box.x)} ${px(-box.y)}`,
    '--cat-still-size': `${px(stillBox.w)} ${px(stillBox.h)}`,
    '--cat-still-pos': `${px(stillBox.x - box.x)} ${px(stillBox.y - box.y)}`,
  } as CSSProperties
}

/** How long a `once` cat waits for its GIF before starting the pass anyway. */
export const CAT_LOAD_FALLBACK_MS = 1500

/**
 * Calls `start` once: when `load` reports the asset ready, or after `fallbackMs`. Returns a cancel.
 * `load` receives the ready callback (wire it to Image onload/decode).
 */
export function startWhenReady(load: (ready: () => void) => void, fallbackMs: number, start: () => void): () => void {
  let done = false
  const fire = () => {
    if (done) return
    done = true
    clearTimeout(timer)
    start()
  }
  const timer = setTimeout(fire, fallbackMs)
  load(fire)
  return () => {
    done = true
    clearTimeout(timer)
  }
}

/** GIFs Hoy may celebrate with: jump (day complete), eat (item meals), lift (gym). */
export function hoyCatAssets(rows: { preset: string | null; hasItems: boolean }[]): CatAsset[] {
  if (rows.length === 0) return []
  const out: CatAsset[] = ['jump']
  if (rows.some((r) => r.preset === 'eat_well' && r.hasItems)) out.push('eat')
  if (rows.some((r) => r.preset === 'gym')) out.push('lift')
  return out
}

/** Preloading is a nicety: never under reduced motion (still frame only) or Save-Data. */
export function shouldPreloadCats(env: { reducedMotion: boolean; saveData: boolean }): boolean {
  return !env.reducedMotion && !env.saveData
}
