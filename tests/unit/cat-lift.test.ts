import { describe, expect, it } from 'vitest'
import { CAT_LIFT, catMask } from '@/lib/motion/cat-lift'

describe('cat-lift asset', () => {
  it('describes the owner GIF and its still', () => {
    expect(CAT_LIFT.gif).toBe('/brand/cat-lift.gif')
    expect(CAT_LIFT.still).toBe('/brand/cat-lift-still.png')
    expect(CAT_LIFT.canvas).toEqual({ w: 360, h: 360 })
    expect(CAT_LIFT.playMs).toBe(6000)
  })

  it('masks the animated GIF while playing', () => {
    const m = catMask('playing')
    expect(m.maskImage).toBe('url(/brand/cat-lift.gif)')
    expect(m.maskSize).toBe('contain')
    expect(m.maskRepeat).toBe('no-repeat')
  })

  it('masks the still at its place on the GIF canvas when resting or reduced', () => {
    for (const state of ['rest', 'reduced'] as const) {
      const m = catMask(state)
      expect(m.maskImage).toBe('url(/brand/cat-lift-still.png)')
      // still is 195x214 at (91,70) of 360x360
      expect(m.maskSize).toBe(`${(195 / 360) * 100}% ${(214 / 360) * 100}%`)
      expect(m.maskPosition).toBe(`${(91 / 165) * 100}% ${(70 / 146) * 100}%`)
    }
  })
})
