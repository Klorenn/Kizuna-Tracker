import { expect, type Page } from "@playwright/test";

/** Test-only password for users created by the specs. */
export const PASSWORD = "kizuna-2026";
/** Seeded users (supabase/seed.sql). */
export const SEED_PASSWORD = "kizuna-test-1";

export const randomHandle = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

/** The five signup steps, from the first field to the "Crear cuenta" click (the page is already /registro). */
export async function fillSignup(page: Page, handle: string, first = "Carolina") {
  await page.getByLabel("Nombre").fill(first);
  await page.getByLabel("Apellido").fill("E2E");
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByLabel("Día").fill("14");
  await page.getByLabel("Mes").fill("03");
  await page.getByLabel("Año").fill("1998");
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByLabel("Usuario").fill(handle);
  await expect(page.getByText(`@${handle} está disponible`)).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByLabel("Correo", { exact: true }).fill(`${handle}@example.com`);
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar contraseña").fill(PASSWORD);
  await page.getByText("Acepto los términos y la privacidad").click();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
}

/** Five-step signup ending on /listo, then "Empezar" to Hoy. */
export async function signUp(page: Page, handle: string, first = "Carolina") {
  await page.goto("/registro");
  await fillSignup(page, handle, first);

  await expect(page).toHaveURL(/\/listo$/);
  await expect(page.getByRole("heading", { name: `Listo, @${handle}` })).toBeVisible();
  await page.getByRole("link", { name: "Empezar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible();
}

export async function logIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo o @usuario").fill(identifier);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Creates a habit from a preset chip ("Agua", "Leer", ...) and lands on Hoy. */
export async function createPresetHabit(page: Page, preset: string) {
  await page.goto("/habitos/nuevo");
  await page.getByRole("button", { name: preset, exact: true }).click();
  await expect(page.getByLabel("Nombre")).toHaveValue(preset);
  await page.getByRole("button", { name: "Crear hábito" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: new RegExp(preset) }).first()).toBeVisible();
}

/**
 * Opens `path` and expects the not-found page. Under the (app) loading boundary Next streams the
 * shell first, so the HTTP status is 200 even for notFound(): accept 404 or the rendered 404 page.
 */
export async function expectNotFound(page: Page, path: string, label = path) {
  const res = await page.goto(path);
  if (res?.status() === 404) return;
  await expect(page.locator("h1").filter({ hasText: /^404$/ }), `${label} renders the 404 page`).toBeVisible();
}

/** Asserts the page does not scroll horizontally at 375 px (restores the viewport after). */
export async function expectNoHorizontalScroll(page: Page, paths: string[]) {
  const previous = page.viewportSize();
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of paths) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, `scrollWidth of ${path}`).toBeLessThanOrEqual(375);
  }
  if (previous) await page.setViewportSize(previous);
}
