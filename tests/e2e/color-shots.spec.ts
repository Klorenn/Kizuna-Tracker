import { expect, test } from "@playwright/test";
import { createPresetHabit, randomHandle, signUp } from "./helpers";

test.skip(!process.env.E2E_SUPABASE || !process.env.COLOR_SHOTS, "needs the local stack and COLOR_SHOTS=<dir>");

/** 375 px screenshots for Tasks 33/35: the Ajustes colour row (light, dark) and Hoy in each colour. */
test("colour theme screenshots", async ({ page, context, baseURL }) => {
  const dir = process.env.COLOR_SHOTS!;
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await signUp(page, randomHandle("shots"), "Colorina");
  await createPresetHabit(page, "Agua");
  await createPresetHabit(page, "Leer");

  const setColor = async (color: string) => {
    await context.addCookies([{ name: "color", value: color, url: baseURL! }]);
  };

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await setColor("kon");
    await page.goto("/perfil/ajustes");
    const group = page.getByRole("radiogroup", { name: "Color" });
    await expect(group).toBeVisible();
    await group.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/ajustes-color-${scheme}.png`, fullPage: true });
  }

  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  for (const color of ["sora", "kon", "fuji", "budo", "mori", "wakaba", "kin", "cha", "nezu", "suna"]) {
    await setColor(color);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/hoy-${color}-light.png`, fullPage: true });
  }
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  for (const color of ["kon", "mori", "suna"]) {
    await setColor(color);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/hoy-${color}-dark.png`, fullPage: true });
  }
});
