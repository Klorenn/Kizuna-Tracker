import { expect, test } from "@playwright/test";

test("unauthenticated visit redirects to the welcome screen", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/bienvenida$/);
  await expect(page.getByRole("link", { name: "Crear cuenta" })).toBeVisible();
});

test("login asks for email or @usuario and has no Google", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Correo o @usuario")).toBeVisible();
  await expect(page.getByText(/google/i)).toHaveCount(0);
});
