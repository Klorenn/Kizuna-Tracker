import { creds, LOGGED_OUT } from "./env";
import { expect, test } from "./fixtures";

test.use({ storageState: LOGGED_OUT });
// Every attempt counts against the app's login limiter (10 per account per 15 min): a retry would burn it.
test.describe.configure({ retries: 0 });

test("the test account can log in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo o @usuario").fill(`@${creds.username}`);
  await page.getByLabel("Contraseña", { exact: true }).fill(creds.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Hoy", level: 1 })).toBeVisible();
});
