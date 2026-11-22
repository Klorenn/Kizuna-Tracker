import { expect, test } from "@playwright/test";

test("welcome shows the brand lockup and both actions", async ({ page }) => {
  await page.goto("/bienvenida");
  await expect(page.getByRole("img", { name: "Kizuna 絆" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rachas y retos con tus amigos." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ya tengo cuenta" })).toBeVisible();
});

test("signup: autofocus, Enter moves to the next empty field, then advances", async ({ page }) => {
  await page.goto("/registro");
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "Paso 1 de 5");
  await expect(page.getByLabel("Nombre")).toBeFocused();

  await page.keyboard.type("Carolina");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Apellido")).toBeFocused();

  await page.keyboard.type("Méndez");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "¿Cuándo naciste?" })).toBeVisible();
  await expect(page.getByLabel("Día")).toBeFocused();

  // segments auto-advance
  await page.keyboard.type("1403");
  await expect(page.getByLabel("Año")).toBeFocused();

  await page.getByRole("button", { name: "Atrás" }).click();
  await expect(page.getByLabel("Nombre")).toHaveValue("Carolina");
});

test("login: password toggle is a pressed-state button", async ({ page }) => {
  await page.goto("/login");
  const toggle = page.getByRole("button", { name: "Mostrar contraseña" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(page.getByRole("button", { name: "Ocultar contraseña" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveAttribute("type", "text");
});
