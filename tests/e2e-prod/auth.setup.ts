import { expect, test as setup } from "@playwright/test";
import { creds } from "./env";

const STATE = "tests/e2e-prod/.auth/state.json";
const GENERIC_ERROR = "Correo, usuario o contraseña incorrectos.";

setup.use({ storageState: { cookies: [], origins: [] } });

/** Returns true when the login landed on Hoy, false on invalid credentials. */
async function tryLogin(page: import("@playwright/test").Page): Promise<boolean> {
  await page.goto("/login");
  await page.getByLabel("Correo o @usuario").fill(`@${creds.username}`);
  await page.getByLabel("Contraseña", { exact: true }).fill(creds.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  const home = page.waitForURL(/\/$/, { timeout: 30_000 }).then(() => true);
  const bad = page.getByText(GENERIC_ERROR).waitFor({ timeout: 30_000 }).then(() => false);
  return Promise.race([home, bad]);
}

async function register(page: import("@playwright/test").Page) {
  await page.goto("/registro");
  await page.getByLabel("Nombre").fill("Prueba");
  await page.getByLabel("Apellido").fill("E2E");
  await page.getByRole("button", { name: "Continuar" }).click();

  // born in 1990: always 25+
  await page.getByLabel("Día").fill("14");
  await page.getByLabel("Mes").fill("03");
  await page.getByLabel("Año").fill("1990");
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByLabel("Usuario").fill(creds.username);
  await expect(page.getByText(`@${creds.username} está disponible`)).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByLabel("Correo", { exact: true }).fill(creds.email);
  await page.getByRole("button", { name: "Continuar" }).click();

  // timezone is sent from the browser (config: America/Santiago)
  await page.getByLabel("Contraseña", { exact: true }).fill(creds.password);
  await page.getByLabel("Confirmar contraseña").fill(creds.password);
  await page.getByText("Acepto los términos y la privacidad").click();
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  await expect(page).toHaveURL(/\/listo$/, { timeout: 30_000 });
  await page.getByRole("link", { name: "Empezar" }).click();
  await expect(page).toHaveURL(/\/$/);
}

setup("authenticate the e2e account (registering it on first run)", async ({ page }) => {
  if (!(await tryLogin(page))) {
    await page.context().clearCookies();
    await register(page);
  }
  await expect(page.getByRole("heading", { name: "Hoy", level: 1 })).toBeVisible();
  await page.context().storageState({ path: STATE });
});
