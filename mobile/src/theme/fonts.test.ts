import { FONT, FONT_ASSETS } from "./fonts";

describe("brand fonts", () => {
  it("every family used by the theme has a bundled file to load (Inter and Geist Mono, as the web)", () => {
    for (const family of Object.values(FONT)) expect(FONT_ASSETS).toHaveProperty([family]);
    expect(Object.keys(FONT_ASSETS).sort()).toEqual([...Object.values(FONT)].sort());
  });
  it("Android picks the weight by family name, so each weight is its own family", () => {
    expect(FONT.regular).toBe("Inter_400Regular");
    expect(FONT.semibold).toBe("Inter_600SemiBold");
    expect(FONT.mono).toBe("GeistMono_400Regular");
  });
});
