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
