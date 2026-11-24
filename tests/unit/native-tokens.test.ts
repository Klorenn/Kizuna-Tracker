import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateTokensSource, parseTokens } from "../../scripts/gen-native-tokens.mjs";
import { COLORS } from "@/lib/theme";

const css = readFileSync("src/styles/tokens.css", "utf8");
const tokens = parseTokens(css);

describe("parseTokens", () => {
  it("reads the light neutrals from @theme, resolving rgb() to rgba()", () => {
    expect(tokens.light.bg).toBe("#fafafa");
    expect(tokens.light.surface).toBe("#ffffff");
    expect(tokens.light.accentHover).toBe("#4c4ca5");
    expect(tokens.light.alertText).toBe("#c9373c");
    expect(tokens.light.scrim).toBe("rgba(17,17,17,0.35)");
    expect(tokens.light.habitSalvia).toBe("#699883");
  });
  it("dark overrides the light values and inherits the rest", () => {
    expect(tokens.dark.bg).toBe("#0f0f10");
    expect(tokens.dark.text).toBe("#ededed");
    expect(tokens.dark.scrim).toBe("rgba(0,0,0,0.6)");
    expect(tokens.dark.habitSalvia).toBe("#8cb7a3");
    expect(tokens.dark.cream).toBe("#f6ebd8"); // not overridden in dark
    expect(tokens.dark.media).toBe("#111111");
  });
  it("has all 17 accents, the same list as src/lib/theme.ts COLORS", () => {
    expect(Object.keys(tokens.accents)).toHaveLength(17);
    expect(Object.keys(tokens.accents).sort()).toEqual([...COLORS].sort());
  });
  it("every accent has light and dark values for the 9 accent-family tokens, all hex", () => {
    const keys = ["accent", "accentHover", "accent2", "accent2Hover", "accentSoft", "heat1", "heat2", "heat3", "heat4"];
    for (const [name, a] of Object.entries(tokens.accents) as [string, { light: Record<string, string>; dark: Record<string, string> }][]) {
      for (const mode of [a.light, a.dark]) {
        expect(Object.keys(mode).sort(), name).toEqual([...keys].sort());
        for (const v of Object.values(mode)) expect(v, name).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
  it("pins indigo to today's accent, light and dark", () => {
    expect(tokens.accents.indigo.light.accent).toBe("#5a5ac2");
    expect(tokens.accents.indigo.light.accentSoft).toBe("#efeff9");
    expect(tokens.accents.indigo.dark.accent).toBe("#8c8cf0");
    expect(tokens.accents.indigo.dark.heat4).toBe("#cdcdfa");
    expect(tokens.light.accent).toBe(tokens.accents.indigo.light.accent);
    expect(tokens.dark.accent).toBe(tokens.accents.indigo.dark.accent);
  });
  it("another accent differs from indigo (sakura)", () => {
    expect(tokens.accents.sakura.light.accent).toBe("#b93f78");
  });
  it("radii and spacing are numbers", () => {
    expect(tokens.radius).toEqual({ sm: 6, md: 10, lg: 15, full: 999 });
    expect(tokens.space).toEqual({ xs: 4, sm: 8, md: 16, lg: 24, xl: 32 });
  });
  it("throws when the dark block is missing", () => {
    expect(() => parseTokens("@theme {\n  --color-bg: #fff;\n}\n")).toThrow(/dark/);
  });
});

describe("generated file parity", () => {
  it("mobile/src/theme/tokens.generated.ts equals the regenerated output", () => {
    expect(readFileSync("mobile/src/theme/tokens.generated.ts", "utf8")).toBe(generateTokensSource(css));
  });
});
