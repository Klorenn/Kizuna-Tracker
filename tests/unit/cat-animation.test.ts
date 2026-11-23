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

import { existsSync } from 'node:fs'

describe('read, sleep and code cats (480 canvas, 73 frames x 80 ms)', () => {
  it('read: downscaled to 480 px, union box 301 x 286 at (78, 94)', () => {
    expect(CAT_ASSETS.read).toEqual({
      gif: '/brand/cat-read.gif',
      still: '/brand/cat-read-still.png',
      canvas: 480,
      box: { x: 78, y: 94, w: 301, h: 286 },
      stillBox: { x: 0, y: 0, w: 480, h: 480 },
      playMs: 5840,
    })
    const r = catAnimationStyle('read', 90) as Record<string, unknown>
    expect(r.width).toBe(90)
    expect(r.height).toBe(86)
    expect(r['--cat-mask-size']).toBe('143.52px 143.52px')
    expect(r['--cat-mask-pos']).toBe('-23.32px -28.11px')
  })
  it('sleep: union box 341 x 296 at (99, 65)', () => {
    expect(CAT_ASSETS.sleep).toEqual({
      gif: '/brand/cat-sleep.gif',
      still: '/brand/cat-sleep-still.png',
      canvas: 480,
      box: { x: 99, y: 65, w: 341, h: 296 },
      stillBox: { x: 0, y: 0, w: 480, h: 480 },
      playMs: 5840,
    })
    expect((catAnimationStyle('sleep', 341) as Record<string, unknown>)['--cat-mask-pos']).toBe('-99px -65px')
  })
  it('code: union box 437 x 262 at (0, 115) (the tail swings to the left edge)', () => {
    expect(CAT_ASSETS.code).toEqual({
      gif: '/brand/cat-code.gif',
      still: '/brand/cat-code-still.png',
      canvas: 480,
      box: { x: 0, y: 115, w: 437, h: 262 },
      stillBox: { x: 0, y: 0, w: 480, h: 480 },
      playMs: 5840,
    })
    const c = catAnimationStyle('code', 437) as Record<string, unknown>
    expect(c.height).toBe(262)
    expect(c['--cat-mask-pos']).toBe('0px -115px')
  })
  it('ships the files', () => {
    for (const a of ['read', 'sleep', 'code']) {
      expect(existsSync(`public/brand/cat-${a}.gif`)).toBe(true)
      expect(existsSync(`public/brand/cat-${a}-still.png`)).toBe(true)
    }
  })
  it('Hoy preloads read for reading habits, sleep for Dormir, code for study', () => {
    expect(
      hoyCatAssets([
        { preset: 'read', hasItems: false, logType: 'reading' },
        { preset: 'sleep', hasItems: false },
        { preset: 'study', hasItems: false },
      ]),
    ).toEqual(['jump', 'read', 'sleep', 'code'])
    expect(hoyCatAssets([{ preset: null, hasItems: false, icon: 'laptop' }])).toEqual(['jump', 'code'])
  })
})
