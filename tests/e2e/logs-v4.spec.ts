import { expect, test, type Page } from "@playwright/test";
import { logIn, SEED_PASSWORD } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase seeded with supabase/seed.sql (E2E_SUPABASE=1)");

// Seeded numbers (supabase/seed.sql, "time, series, quantity, distance (v4)" block), all of
// user_a and private: today "1 h 25 min · Álgebra · 2 pomodoros", Agua "5 de 8 vasos" with five
// sums and no check-in, Trotar 5,2 km in 29:40 (5:42 /km), Dark "5 de 26 episodios", Dune
// finished this month. Nothing here writes: the demo data stays as it is.
const ESTUDIAR = "b0000000-0000-0000-0000-0000000000c1";
const SERIES = "b0000000-0000-0000-0000-0000000000c2";
const AGUA = "b0000000-0000-0000-0000-0000000000c3";
const TROTAR = "b0000000-0000-0000-0000-0000000000c4";
const LEER = "b0000000-0000-0000-0000-00000000000a";

async function noHorizontalScroll(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(375);
}

test("Resumen shows the v4 cards and each opens its drill-down", async ({ page }) => {
  await logIn(page, "@user_a", SEED_PASSWORD);
  await page.goto("/resumen");

  const card = (name: RegExp) => page.getByRole("link", { name });
  await expect(card(/^Tiempo \d/)).toBeVisible();
  await expect(card(/^Películas \d/)).toBeVisible();
  await expect(card(/^Episodios \d/)).toBeVisible();
  await expect(card(/^Agua .*vasos\/día/)).toBeVisible();
  await expect(card(/^Trote .* km/)).toBeVisible();
  await expect(card(/^Agua /)).toHaveAttribute("href", new RegExp(`^/resumen/cantidad/${AGUA}\\?mes=\\d{4}-\\d{2}$`));

  await card(/^Tiempo \d/).click();
  await expect(page).toHaveURL(/\/resumen\/tiempo\?mes=/);
  await expect(page.getByRole("heading", { name: "Tiempo", level: 1 })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Tiempo por mes:/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Tiempo por semana de /i })).toBeVisible();
  await expect(page.getByText("Álgebra").first()).toBeVisible();

  await page.goto("/resumen");
  await card(/^Trote .* km/).click();
  await expect(page).toHaveURL(/\/resumen\/distancia\?mes=/);
  await expect(page.getByText("Mejor ritmo")).toBeVisible();
  await expect(page.getByRole("img", { name: /^Ritmo por salida:/ })).toBeVisible();
  await expect(page.getByText("5,2 km · 29:40 · 5:42 /km")).toBeVisible();

  await page.goto("/resumen");
  await card(/^Películas \d/).click();
  await expect(page).toHaveURL(/\/resumen\/series\?mes=/);
  await expect(page.getByRole("img", { name: /^Episodios por mes:/ })).toBeVisible();
  await expect(page.getByText("Dune").first()).toBeVisible();

  await page.goto("/resumen");
  await card(/^Agua /).click();
  await expect(page).toHaveURL(new RegExp(`/resumen/cantidad/${AGUA}`));
  await expect(page.getByRole("heading", { name: "Agua", level: 1 })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Promedio por día y por mes, en vasos:/ })).toBeVisible();
});

test("the calendar day sheet shows time, distance and water with their sums", async ({ page }) => {
  await logIn(page, "@user_a", SEED_PASSWORD);
  await page.goto("/resumen");

  const todayCell = page.locator('[role="grid"] [aria-current="date"]');
  // a day with sums under the goal keeps the "in progress" shape and says so in its name
  await expect(todayCell).toHaveAttribute("aria-label", /Agua 5 de 8 vasos/);
  await todayCell.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("1 h 25 min · Álgebra · 2 pomodoros")).toBeVisible();
  await expect(sheet.getByText("Trote · 5,2 km · 29:40 · 5:42 /km")).toBeVisible();
  await expect(sheet.getByText("5 de 8 vasos")).toBeVisible();
  const sums = sheet.getByRole("list", { name: "Sumas del día" }).getByRole("listitem");
  await expect(sums).toHaveCount(5);
  await expect(sums.first()).toContainText(/\d{1,2}:\d{2}/);
  await expect(sums.first()).toContainText("1 vaso");
  await expect(sheet.getByText("Dark · 1 episodio · T1 E5")).toBeVisible();
  // the entry screens belong to other areas: only the links are checked
  await expect(sheet.getByRole("link", { name: "Editar" }).first()).toHaveAttribute(
    "href",
    new RegExp(`/habitos/[0-9a-f-]+/(tiempo|visto|distancia)\\?fecha=\\d{4}-\\d{2}-\\d{2}$`),
  );
  await expect(sheet.getByRole("link", { name: "Editar en Hoy" })).toHaveAttribute("href", "/");
});

test("habit detail PROGRESO for each kind, and the book in one format", async ({ page }) => {
  await logIn(page, "@user_a", SEED_PASSWORD);

  await page.goto(`/habitos/${ESTUDIAR}`);
  await expect(page.getByText("Progreso", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Iniciar pomodoro" })).toHaveAttribute("href", `/habitos/${ESTUDIAR}/pomodoro`);
  await expect(page.getByText("Pomodoros este mes")).toBeVisible();

  await page.goto(`/habitos/${SERIES}`);
  await expect(page.getByText(/Dark · 5 de 26 episodios/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Series y películas" })).toHaveAttribute("href", "/series");

  await page.goto(`/habitos/${AGUA}`);
  await expect(page.getByText("Días cumplidos").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver por mes", exact: true })).toHaveAttribute("href", `/resumen/cantidad/${AGUA}`);

  await page.goto(`/habitos/${TROTAR}`);
  await expect(page.getByText("Mejor ritmo")).toBeVisible();
  await expect(page.getByText(/Última salida/)).toBeVisible();

  await page.goto(`/habitos/${LEER}`);
  await expect(page.getByText("página 40 de 412 · 10 %")).toBeVisible();
});

test("none of it is visible to anyone else", async ({ browser, page }) => {
  const leaks = ["Álgebra", "Dark", "vasos", "km"];

  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto("/@user_a");
  await expect(anonPage.getByRole("heading", { name: "Ana Prueba", level: 1 })).toBeVisible();
  await anonPage.waitForLoadState("networkidle");
  const anonText = await anonPage.locator("main").innerText();
  for (const leak of leaks) expect(anonText).not.toContain(leak);
  await anon.close();

  // a friend neither: the day-level detail of these kinds is the owner's
  await logIn(page, "@user_b", SEED_PASSWORD);
  await page.goto("/@user_a");
  await expect(page.getByRole("heading", { name: "Ana Prueba", level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const friendText = await page.locator("main").innerText();
  for (const leak of leaks) expect(friendText).not.toContain(leak);
});

test("every new view fits 375 px", async ({ page }) => {
  await logIn(page, "@user_a", SEED_PASSWORD);
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of [
    "/resumen",
    "/resumen/tiempo",
    "/resumen/tiempo?rango=12",
    "/resumen/series",
    `/resumen/cantidad/${AGUA}`,
    "/resumen/distancia",
    `/habitos/${ESTUDIAR}`,
    `/habitos/${SERIES}`,
    `/habitos/${AGUA}`,
    `/habitos/${TROTAR}`,
  ]) {
    await noHorizontalScroll(page, path);
  }
});
