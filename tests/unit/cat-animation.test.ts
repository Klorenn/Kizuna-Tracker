import { describe, expect, it } from "vitest";
import { BRAND_ASSET_VERSION, brandUrl } from "@/lib/brand-assets";
import { CAT_ASSETS, catAnimationStyle } from "@/lib/motion/cat-animation";
import { CAT_LIFT, catLiftStyle } from "@/lib/motion/cat-lift";

describe("cat-animation assets", () => {
  it("keeps CAT_LIFT as the lift asset", () => {
    expect(CAT_ASSETS.lift).toBe(CAT_LIFT);
    expect(catAnimationStyle("lift", 235)).toEqual(catLiftStyle(235));
  });

  it("describes the jump GIF: 73 frames of 80 ms on a 480 canvas, union box 310 x 393", () => {
    const j = CAT_ASSETS.jump;
    expect(j.gif).toBe(brandUrl("cat-jump.gif"));
    expect(j.still).toBe(brandUrl("cat-jump-still.png"));
    expect(j.canvas).toBe(480);
    expect(j.box).toEqual({ x: 106, y: 52, w: 310, h: 393 });
    expect(j.stillBox).toEqual({ x: 0, y: 0, w: 480, h: 480 });
    expect(j.playMs).toBe(5840);
  });

  it("describes the eat GIF: 73 frames of 80 ms on a 480 canvas, union box 232 x 287", () => {
    const e = CAT_ASSETS.eat;
    expect(e.gif).toBe(brandUrl("cat-eat.gif"));
    expect(e.still).toBe(brandUrl("cat-eat-still.png"));
    expect(e.canvas).toBe(480);
    expect(e.box).toEqual({ x: 108, y: 91, w: 232, h: 287 });
    expect(e.stillBox).toEqual({ x: 0, y: 0, w: 480, h: 480 });
    expect(e.playMs).toBe(5840);
    const s = catAnimationStyle("eat", 232) as Record<string, unknown>;
    expect(s.height).toBe(287);
    expect(s["--cat-mask-pos"]).toBe("-108px -91px");
  });

  it("crops the jump mask to the cat box", () => {
    const s = catAnimationStyle("jump", 310) as Record<string, unknown>;
    expect(s.width).toBe(310);
    expect(s.height).toBe(393);
    expect(s["--cat-mask-size"]).toBe("480px 480px");
    expect(s["--cat-mask-pos"]).toBe("-106px -52px");
    expect(s["--cat-still-size"]).toBe("480px 480px");
    expect(s["--cat-still-pos"]).toBe("-106px -52px");
  });

  it("scales with width", () => {
    const s = catAnimationStyle("jump", 93) as Record<string, unknown>;
    expect(s.height).toBe(118);
    expect(s["--cat-mask-size"]).toBe("144px 144px");
  });

  it("exposes the asset urls as css variables", () => {
    const s = catAnimationStyle("jump", 93) as Record<string, unknown>;
    expect(s["--cat-gif"]).toBe(`url(${brandUrl("cat-jump.gif")})`);
    expect(s["--cat-still"]).toBe(`url(${brandUrl("cat-jump-still.png")})`);
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
    expect(catUrls('jump', 'still')).toEqual([brandUrl("cat-jump-still.png")])
    const s = catAnimationStyle('jump', 40, 'still') as Record<string, string>
    expect(JSON.stringify(s)).not.toContain('.gif')
    expect(s['--cat-gif']).toBe(`url(${brandUrl("cat-jump-still.png")})`)
  })
  it('an animated cat uses the GIF and its still', () => {
    expect(catUrls('lift', 'animated')).toEqual([brandUrl("cat-lift.gif"), brandUrl("cat-lift-still.png")])
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

describe('read, sleep (480 canvas) and code (320 canvas) cats, 73 frames x 80 ms', () => {
  it('read: downscaled to 480 px, union box 301 x 286 at (78, 94)', () => {
    expect(CAT_ASSETS.read).toEqual({
      gif: brandUrl("cat-read.gif"),
      still: brandUrl("cat-read-still.png"),
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
      gif: brandUrl("cat-sleep.gif"),
      still: brandUrl("cat-sleep-still.png"),
      canvas: 480,
      box: { x: 99, y: 65, w: 341, h: 296 },
      stillBox: { x: 0, y: 0, w: 480, h: 480 },
      playMs: 5840,
    })
    expect((catAnimationStyle('sleep', 341) as Record<string, unknown>)['--cat-mask-pos']).toBe('-99px -65px')
  })
  it('code: 320 canvas, union box 292 x 176 at (0, 76) (the tail swings to the left edge)', () => {
    expect(CAT_ASSETS.code).toEqual({
      gif: brandUrl("cat-code.gif"),
      still: brandUrl("cat-code-still.png"),
      canvas: 320,
      box: { x: 0, y: 76, w: 292, h: 176 },
      stillBox: { x: 0, y: 0, w: 320, h: 320 },
      playMs: 5840,
    })
    const c = catAnimationStyle('code', 292) as Record<string, unknown>
    expect(c.height).toBe(176)
    expect(c['--cat-mask-pos']).toBe('0px -76px')
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

describe('brand asset versioning', () => {
  it('builds every cat url with the version query, so a re-encode busts browser and service worker caches', () => {
    expect(brandUrl('cat-jump.gif')).toBe(`/brand/cat-jump.gif?v=${BRAND_ASSET_VERSION}`)
    for (const a of Object.values(CAT_ASSETS)) {
      expect(a.gif).toMatch(new RegExp(`^/brand/cat-[a-z]+\\.gif\\?v=${BRAND_ASSET_VERSION}$`))
      expect(a.still).toMatch(new RegExp(`^/brand/cat-[a-z]+-still\\.png\\?v=${BRAND_ASSET_VERSION}$`))
    }
  })
  it('is at least 2 since the gifsicle re-encode', () => {
    expect(Number(BRAND_ASSET_VERSION)).toBeGreaterThanOrEqual(2)
  })
})
