import { expect, test } from "@playwright/test";
import { monthTitle, shiftMonth } from "../../src/domain/calendar";
import { logIn, SEED_PASSWORD } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase seeded with supabase/seed.sql (E2E_SUPABASE=1)");

// Seeded numbers (supabase/seed.sql, "detailed logs" block): today Dune 14 -> 40 and a leg day
// (Sentadilla 5 x 75 / 5 x 80, Prensa 10 x 120, Extensión 12 x 30); last month Sentadilla 60,
// Prensa 100 and "El nombre del viento" finished; latest weight 71,9 kg today.
const TZ = "America/Santiago";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const m1 = shiftMonth(today.slice(0, 7), -1);

async function noHorizontalScroll(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(375);
}

test("user_a sees REGISTROS, the drill-downs, the calendar log and PROGRESO with the seeded numbers", async ({
  page,
}) => {
  await logIn(page, "@user_a", SEED_PASSWORD);

  // Resumen > REGISTROS
  await page.goto("/resumen");
  await expect(page.getByText(`Registros · ${monthTitle(today.slice(0, 7)).name}`)).toBeVisible();
  await expect(page.getByRole("link", { name: /^Páginas 26\./ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Peso 71,9 kg\..*Solo tú$/ })).toHaveAttribute("href", "/resumen/peso");
  const group = page.getByRole("link", { name: /^Pierna \+40 kg\./ });
  await expect(group).toBeVisible();

  // calendar day sheet of today: the reading and the workout under their habits, private weight
  await page.locator('[role="grid"] [aria-current="date"]').click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Dune")).toBeVisible();
  await expect(sheet.getByText("14 → 40 · 26 páginas")).toBeVisible();
  await expect(sheet.getByText(/5 × 80 kg/)).toBeVisible();
  await expect(sheet.getByText("Peso · 71,9 kg")).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Editar" }).first()).toHaveAttribute(
    "href",
    new RegExp(`/habitos/[0-9a-f-]+/(lectura|entrenamiento)\\?fecha=${today}$`),
  );
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // group drill-down -> exercise
  await group.click();
  await expect(page).toHaveURL(/\/resumen\/gimnasio\/legs$/);
  await expect(page.getByText(`Subiste 40 kg en pierna`)).toBeVisible();
  await expect(page.getByRole("link", { name: /Prensa.*\+20 kg/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Extensión de cuádriceps.*Nuevo/ })).toBeVisible();
  await page.getByRole("link", { name: /^Sentadilla/ }).click();
  await expect(page).toHaveURL(/\/resumen\/ejercicio\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("img", { name: /Mejor peso por sesión de Sentadilla/ })).toBeVisible();
  await expect(page.getByText("Mejor marca")).toBeVisible();

  // reading drill-down of last month
  await page.goto(`/resumen/lectura?mes=${m1}`);
  await expect(page.getByRole("heading", { name: new RegExp(monthTitle(m1).name) })).toBeVisible();
  await expect(page.getByText("El nombre del viento").first()).toBeVisible();
  await page.getByRole("radio", { name: "12 meses" }).click();
  await expect(page).toHaveURL(/rango=12/);
  await expect(page.getByRole("img", { name: /^Páginas por mes:/ })).toBeVisible();

  await page.goto("/resumen/gimnasio");
  await expect(page.getByRole("link", { name: /Pierna.*\+40 kg/ })).toBeVisible();

  // habit detail > PROGRESO
  await page.goto(`/habitos/b0000000-0000-0000-0000-00000000000a`);
  await expect(page.getByText("Progreso", { exact: true })).toBeVisible();
  await expect(page.getByText("40 de 412")).toBeVisible();
  await page.goto(`/habitos/b0000000-0000-0000-0000-0000000000a2`);
  await expect(page.getByText("Progreso", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sentadilla.*Mejor 80 kg/ })).toBeVisible();

  // unknown group / foreign exercise -> 404
  const bad = await page.goto("/resumen/gimnasio/cardio");
  expect(bad?.status()).toBe(404);

  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of [
    "/resumen",
    "/resumen/lectura",
    "/resumen/gimnasio",
    "/resumen/gimnasio/legs",
    "/habitos/b0000000-0000-0000-0000-00000000000a",
    "/habitos/b0000000-0000-0000-0000-0000000000a2",
  ]) {
    await noHorizontalScroll(page, path);
  }
});

test("a friend sees nothing of Ana's logs or weight on her profile", async ({ page }) => {
  await logIn(page, "@user_b", SEED_PASSWORD);
  await page.goto("/@user_a");
  await expect(page.getByRole("heading", { name: "Ana Prueba", level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const text = await page.locator("main").innerText();
  for (const leak of ["Dune", "páginas", "71,9", "Peso", "Sentadilla"]) expect(text).not.toContain(leak);
});
