import type { CSSProperties } from 'react'

/** Owner asset: white cat on transparent, 60 frames x 100 ms, drawn on a 360x360 canvas. */
export const CAT_LIFT = {
  gif: '/brand/cat-lift.gif',
  still: '/brand/cat-lift-still.png',
  canvas: { w: 360, h: 360 },
  /** frame 0 cropped to the cat: 195x214 placed at (91,70) on the canvas */
  stillBox: { w: 195, h: 214, x: 91, y: 70 },
  playMs: 6000,
} as const

export type CatState = 'playing' | 'rest' | 'reduced'

/**
 * Mask styles that turn the white silhouette into the element's background color.
 * `playing` animates the GIF; `rest` and `reduced` show frame 0 at the same place.
 */
export function catMask(state: CatState): CSSProperties {
  if (state === 'playing') {
    return { maskImage: `url(${CAT_LIFT.gif})`, maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center' }
  }
  const { canvas: c, stillBox: s } = CAT_LIFT
  return {
    maskImage: `url(${CAT_LIFT.still})`,
    maskSize: `${(s.w / c.w) * 100}% ${(s.h / c.h) * 100}%`,
    maskRepeat: 'no-repeat',
    maskPosition: `${(s.x / (c.w - s.w)) * 100}% ${(s.y / (c.h - s.h)) * 100}%`,
  }
}
