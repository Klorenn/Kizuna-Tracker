import { accents, darkTokens, lightTokens } from "./tokens.generated";
import { resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("light indigo is the base light tokens", () => {
    const t = resolveTheme({ accent: "indigo", mode: "light", systemScheme: "dark" });
    expect(t.isDark).toBe(false);
    expect(t.colors.bg).toBe(lightTokens.bg);
    expect(t.colors.accent).toBe("#5a5ac2");
  });
  it("dark indigo is the base dark tokens", () => {
    const t = resolveTheme({ accent: "indigo", mode: "dark", systemScheme: "light" });
    expect(t.isDark).toBe(true);
    expect(t.colors.bg).toBe(darkTokens.bg);
    expect(t.colors.accent).toBe("#8c8cf0");
  });
  it("system follows the OS scheme (and falls back to light when unknown)", () => {
    expect(resolveTheme({ accent: "indigo", mode: "system", systemScheme: "dark" }).isDark).toBe(true);
    expect(resolveTheme({ accent: "indigo", mode: "system", systemScheme: "light" }).isDark).toBe(false);
    expect(resolveTheme({ accent: "indigo", mode: "system", systemScheme: null }).isDark).toBe(false);
  });
  it("another accent swaps only the accent family, per mode, and keeps the neutrals", () => {
    const light = resolveTheme({ accent: "sakura", mode: "light", systemScheme: null });
    expect(light.colors.accent).toBe(accents.sakura.light.accent);
    expect(light.colors.heat3).toBe(accents.sakura.light.heat3);
    expect(light.colors.bg).toBe(lightTokens.bg);
    expect(light.colors.alert).toBe(lightTokens.alert);
    const dark = resolveTheme({ accent: "sakura", mode: "dark", systemScheme: null });
    expect(dark.colors.accent).toBe(accents.sakura.dark.accent);
    expect(dark.colors.accent).not.toBe(light.colors.accent);
  });
  it("exposes habit colors by key and the cat follows the accent", () => {
    const t = resolveTheme({ accent: "umi", mode: "light", systemScheme: null });
    expect(t.habitColor("salvia")).toBe(lightTokens.habitSalvia);
    expect(t.habitColor("not-a-color")).toBe(lightTokens.habitIndigo);
    expect(t.colors.cat).toBe(t.colors.accent);
  });
});
