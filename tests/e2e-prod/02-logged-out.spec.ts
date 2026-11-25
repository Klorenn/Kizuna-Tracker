import { LOGGED_OUT } from "./env";
import { expect, test } from "./fixtures";

test.use({ storageState: LOGGED_OUT });

test("/bienvenida renders", async ({ page }) => {
  await page.goto("/bienvenida");
  await expect(page.getByRole("link", { name: "Crear cuenta" })).toBeVisible();
});

test("/login renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Correo o @usuario")).toBeVisible();
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
});

test("protected / redirects to /bienvenida", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/bienvenida$/);
});
