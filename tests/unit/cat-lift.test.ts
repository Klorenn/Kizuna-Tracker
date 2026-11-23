import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAT_LIFT, catLiftStyle } from "@/lib/motion/cat-lift";

describe("cat-lift asset", () => {
  it("describes the owner GIF, its still and the single pass", () => {
    expect(CAT_LIFT.gif).toBe("/brand/cat-lift.gif");
    expect(CAT_LIFT.still).toBe("/brand/cat-lift-still.png");
    expect(CAT_LIFT.canvas).toBe(360);
    expect(CAT_LIFT.playMs).toBe(6000);
  });

  it("crops the mask to the cat box so width is the cat's width", () => {
    const s = catLiftStyle(235) as Record<string, unknown>;
    expect(s.width).toBe(235);
    expect(s.height).toBe(239);
    expect(s["--cat-mask-size"]).toBe("360px 360px");
    expect(s["--cat-mask-pos"]).toBe("-68px -45px");
  });

  it("places the still frame at its spot inside the box", () => {
    const s = catLiftStyle(235) as Record<string, unknown>;
    expect(s["--cat-still-size"]).toBe("195px 214px");
    expect(s["--cat-still-pos"]).toBe("23px 25px");
  });
});

describe("cat-lift css", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  it("swaps to the still when resting after one pass", () => {
    expect(css).toMatch(/\.cat-mask\[data-cat-rest\][^}]*var\(--cat-still\)/);
  });

  it("swaps to the still and fades in under prefers-reduced-motion", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toContain("var(--cat-still)");
    expect(block).toContain("animation: cat-fade 300ms");
  });
});
