import { expect, test } from "./fixtures";

// Runs last and reuses the session saved by auth.setup (no login of its own: every attempt counts against the
// app's login limiter). signOut is global, so it revokes that session; the next run's setup logs in again.
test.describe.configure({ retries: 0 });

test("logout works", async ({ page }) => {
  await page.goto("/perfil/ajustes");
  await page.getByRole("button", { name: /Cerrar sesión/ }).click();
  await expect(page).toHaveURL(/\/(bienvenida|login)/, { timeout: 30_000 });

  await page.goto("/");
  await expect(page).toHaveURL(/\/bienvenida$/);
});
