import type { CSSProperties } from "react";
import { isRestHabit, isStudyHabit } from "@/domain/day-complete";
import { brandUrl } from "@/lib/brand-assets";

/*
 * Owner's cat GIFs. Each is rendered as a luminance CSS mask cropped to the cat's union bounding
 * box (across every frame), so `width` is the cat's real width. The still PNG is the frame shown
 * at rest and under prefers-reduced-motion; `stillBox` is where it sits on the GIF canvas.
 *
 * - lift: 360 x 360 canvas, 60 frames; cat box 235 x 239 at (68, 45). The still is frame 0
 *   trimmed to 195 x 214, which sits at (91, 70).
 * - jump: 480 x 480 canvas, 73 frames x 80 ms; cat box 310 x 393 at (106, 52). The still is the
 *   full coalesced frame 0.
 *
 * Every GIF was re-encoded with `gifsicle -O3 --lossy=60 --colors 16` (frame count and delays
 * untouched; the mask only needs gray levels). jump and eat were downscaled 720 -> 480 and code
 * 480 -> 320 (they are shown at 96 to 112 CSS px), so their boxes are the union of the new
 * coalesced frames. Stills of resized cats were resized with them. sleep was already 15 colors.
 */
export const CAT_LIFT = {
  gif: brandUrl("cat-lift.gif"),
  still: brandUrl("cat-lift-still.png"),
  canvas: 360,
  box: { x: 68, y: 45, w: 235, h: 239 },
  stillBox: { x: 91, y: 70, w: 195, h: 214 },
  /** one full pass of the GIF (it loops forever by itself): after this the cat rests on the still */
  playMs: 6000,
} as const;

export const CAT_JUMP = {
  gif: brandUrl("cat-jump.gif"),
  still: brandUrl("cat-jump-still.png"),
  canvas: 480,
  box: { x: 106, y: 52, w: 310, h: 393 },
  stillBox: { x: 0, y: 0, w: 480, h: 480 },
  playMs: 5840,
} as const;

/** 480 x 480 canvas, 73 frames x 80 ms; cat box 232 x 287 at (108, 91). The still is the full frame 0. */
export const CAT_EAT = {
  gif: brandUrl("cat-eat.gif"),
  still: brandUrl("cat-eat-still.png"),
  canvas: 480,
  box: { x: 108, y: 91, w: 232, h: 287 },
  stillBox: { x: 0, y: 0, w: 480, h: 480 },
  playMs: 5840,
} as const;

/*
 * read, sleep (480 x 480 canvas) and code (320 x 320), 73 frames x 80 ms; the still is the full frame 0. Boxes
 * are the union of the coalesced frames (`magick X.gif -coalesce -format "%@\n" info:` -> min/max).
 * - read: downscaled from the owner's 720 px file (gifsicle, 32 grays): box 301 x 286 at (78, 94).
 * - sleep: the owner's fill is cream, which a luminance mask turns translucent, so the file is
 *   levelled to pure white (grays 0..88% -> 0..100%): the cat renders solid accent, lines stay cut out.
 *   Box 341 x 296 at (99, 65) (includes the "z z Z").
 * - code: 16 grays, downscaled to 320 px; the black laptop screen is a cut-out. Box 292 x 176 at
 *   (0, 76): the tail swings to the left edge.
 */
const catSquare = <C extends number>(name: string, canvas: C, box: { x: number; y: number; w: number; h: number }) =>
  ({
    gif: brandUrl(`cat-${name}.gif`),
    still: brandUrl(`cat-${name}-still.png`),
    canvas,
    box,
    stillBox: { x: 0, y: 0, w: canvas, h: canvas },
    playMs: 5840,
  }) as const;

export const CAT_READ = catSquare("read", 480, { x: 78, y: 94, w: 301, h: 286 });
export const CAT_SLEEP = catSquare("sleep", 480, { x: 99, y: 65, w: 341, h: 296 });
export const CAT_CODE = catSquare("code", 320, { x: 0, y: 76, w: 292, h: 176 });

export const CAT_ASSETS = {
  lift: CAT_LIFT,
  jump: CAT_JUMP,
  eat: CAT_EAT,
  read: CAT_READ,
  sleep: CAT_SLEEP,
  code: CAT_CODE,
} as const;
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

/**
 * GIFs Hoy may celebrate with: jump (day complete, book finished, water goal), eat (item meals), lift (gym),
 * read (reading saved), sleep (Dormir 8 h), code (study habits).
 */
export function hoyCatAssets(
  rows: { preset: string | null; hasItems: boolean; logType?: string; icon?: string }[],
): CatAsset[] {
  if (rows.length === 0) return []
  const out: CatAsset[] = ['jump']
  if (rows.some((r) => r.preset === 'eat_well' && r.hasItems)) out.push('eat')
  if (rows.some((r) => r.preset === 'gym')) out.push('lift')
  if (rows.some((r) => r.logType === 'reading')) out.push('read')
  if (rows.some((r) => isRestHabit(r))) out.push('sleep')
  if (rows.some((r) => isStudyHabit(r))) out.push('code')
  return out
}

/** Preloading is a nicety: never under reduced motion (still frame only) or Save-Data. */
export function shouldPreloadCats(env: { reducedMotion: boolean; saveData: boolean }): boolean {
  return !env.reducedMotion && !env.saveData
}
