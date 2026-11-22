import { expect, test } from "@playwright/test";
import { LOGIN_GENERIC_ERROR } from "@/lib/login";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase (E2E_SUPABASE=1)");

const PASSWORD = "kizuna-2026";

test("five-step signup, sign out, login by @usuario", async ({ page }) => {
  const handle = `e2e_${Math.random().toString(36).slice(2, 10)}`;
  await page.goto("/registro");

  await page.getByLabel("Nombre").fill("Carolina");
  await page.getByLabel("Apellido").fill("Méndez");
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

  await expect(page).toHaveURL(/\/listo$/);
  await expect(page.getByRole("heading", { name: `Listo, @${handle}` })).toBeVisible();
  await page.getByRole("link", { name: "Empezar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible();

  // sign out by clearing the session cookies, then log back in
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Correo o @usuario").fill(`@${handle}`);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Correo o @usuario").fill(`@${handle}`);
  await page.getByLabel("Contraseña", { exact: true }).fill("incorrecta-123");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByText(LOGIN_GENERIC_ERROR)).toBeVisible();
});
