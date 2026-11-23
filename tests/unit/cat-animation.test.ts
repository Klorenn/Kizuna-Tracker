import { describe, expect, it } from "vitest";
import { CAT_ASSETS, catAnimationStyle } from "@/lib/motion/cat-animation";
import { CAT_LIFT, catLiftStyle } from "@/lib/motion/cat-lift";

describe("cat-animation assets", () => {
  it("keeps CAT_LIFT as the lift asset", () => {
    expect(CAT_ASSETS.lift).toBe(CAT_LIFT);
    expect(catAnimationStyle("lift", 235)).toEqual(catLiftStyle(235));
  });

  it("describes the jump GIF: 73 frames of 80 ms on a 720 canvas, union box 465 x 589", () => {
    const j = CAT_ASSETS.jump;
    expect(j.gif).toBe("/brand/cat-jump.gif");
    expect(j.still).toBe("/brand/cat-jump-still.png");
    expect(j.canvas).toBe(720);
    expect(j.box).toEqual({ x: 159, y: 78, w: 465, h: 589 });
    expect(j.stillBox).toEqual({ x: 0, y: 0, w: 720, h: 720 });
    expect(j.playMs).toBe(5840);
  });

  it("describes the eat GIF: 73 frames of 80 ms on a 720 canvas, union box 350 x 429", () => {
    const e = CAT_ASSETS.eat;
    expect(e.gif).toBe("/brand/cat-eat.gif");
    expect(e.still).toBe("/brand/cat-eat-still.png");
    expect(e.canvas).toBe(720);
    expect(e.box).toEqual({ x: 160, y: 137, w: 350, h: 429 });
    expect(e.stillBox).toEqual({ x: 0, y: 0, w: 720, h: 720 });
    expect(e.playMs).toBe(5840);
    const s = catAnimationStyle("eat", 350) as Record<string, unknown>;
    expect(s.height).toBe(429);
    expect(s["--cat-mask-pos"]).toBe("-160px -137px");
  });

  it("crops the jump mask to the cat box", () => {
    const s = catAnimationStyle("jump", 465) as Record<string, unknown>;
    expect(s.width).toBe(465);
    expect(s.height).toBe(589);
    expect(s["--cat-mask-size"]).toBe("720px 720px");
    expect(s["--cat-mask-pos"]).toBe("-159px -78px");
    expect(s["--cat-still-size"]).toBe("720px 720px");
    expect(s["--cat-still-pos"]).toBe("-159px -78px");
  });

  it("scales with width", () => {
    const s = catAnimationStyle("jump", 93) as Record<string, unknown>;
    expect(s.height).toBe(118);
    expect(s["--cat-mask-size"]).toBe("144px 144px");
  });

  it("exposes the asset urls as css variables", () => {
    const s = catAnimationStyle("jump", 93) as Record<string, unknown>;
    expect(s["--cat-gif"]).toBe("url(/brand/cat-jump.gif)");
    expect(s["--cat-still"]).toBe("url(/brand/cat-jump-still.png)");
  });
});

import { catUrls, catVariantFor, hoyCatAssets, shouldPreloadCats } from '@/lib/motion/cat-animation'

describe('cat variants (small badges are still)', () => {
  it('badges up to 64 px use the still PNG only', () => {
    expect(catVariantFor(40)).toBe('still')
    expect(catVariantFor(48)).toBe('still')
    expect(catVariantFor(64)).toBe('still')
    expect(catVariantFor(96)).toBe('animated')
    expect(catVariantFor(160)).toBe('animated')
  })
  it('a still cat never references the GIF', () => {
    expect(catUrls('jump', 'still')).toEqual(['/brand/cat-jump-still.png'])
    const s = catAnimationStyle('jump', 40, 'still') as Record<string, string>
    expect(JSON.stringify(s)).not.toContain('.gif')
    expect(s['--cat-gif']).toBe('url(/brand/cat-jump-still.png)')
  })
  it('an animated cat uses the GIF and its still', () => {
    expect(catUrls('lift', 'animated')).toEqual(['/brand/cat-lift.gif', '/brand/cat-lift-still.png'])
  })
})

describe('Hoy cat preloading', () => {
  it('preloads jump for any day, eat for item meals, lift for gym', () => {
    expect(hoyCatAssets([])).toEqual([])
    expect(hoyCatAssets([{ preset: 'read', hasItems: false }])).toEqual(['jump'])
    expect(
      hoyCatAssets([
        { preset: 'eat_well', hasItems: true },
        { preset: 'gym', hasItems: false },
      ]),
    ).toEqual(['jump', 'eat', 'lift'])
    expect(hoyCatAssets([{ preset: 'eat_well', hasItems: false }])).toEqual(['jump'])
  })
  it('skips under reduced motion or Save-Data', () => {
    expect(shouldPreloadCats({ reducedMotion: false, saveData: false })).toBe(true)
    expect(shouldPreloadCats({ reducedMotion: true, saveData: false })).toBe(false)
    expect(shouldPreloadCats({ reducedMotion: false, saveData: true })).toBe(false)
  })
})
