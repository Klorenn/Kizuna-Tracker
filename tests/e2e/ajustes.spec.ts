import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, logIn, SEED_PASSWORD } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase seeded with supabase/seed.sql (E2E_SUPABASE=1)");

test("seeded user_a opens Ajustes from Perfil and sees every settings group", async ({ page }) => {
  await logIn(page, "@user_a", SEED_PASSWORD);

  await page.goto("/perfil");
  await expect(page.getByRole("heading", { name: "Perfil", level: 1 })).toBeVisible();
  await expect(page.getByText(/^Miembro desde /)).toBeVisible();
  await expect(page.getByRole("link", { name: /Leer/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Deudas/ })).toHaveAttribute("href", "/deudas");
  await expect(page.getByRole("img", { name: /check-ins en .* de las últimas 12 semanas/ })).toBeVisible();

  await page.getByRole("link", { name: "Ajustes" }).click();
  await expect(page).toHaveURL(/\/perfil\/ajustes$/);
  await expect(page.getByRole("heading", { name: "Ajustes", level: 1 })).toBeVisible();
  for (const group of ["Cuenta", "Preferencias", "Notificaciones", "Privacidad", "Legal", "Sesión", "Zona de peligro"]) {
    await expect(page.getByRole("heading", { name: group, level: 2 })).toBeVisible();
  }
  await expect(page.getByText("user_a@example.com")).toBeVisible();
  await expect(page.getByRole("button", { name: /Usuario @user_a/ })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Tema" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Cerrar sesión/ })).toBeVisible();
  // Deudas lives on Perfil now, not in settings
  await expect(page.getByRole("main").getByRole("link", { name: /Deudas/ })).toHaveCount(0);

  // Borrar cuenta keeps the @usuario confirmation
  await page.getByRole("button", { name: /Borrar cuenta/ }).click();
  await expect(page.getByRole("dialog", { name: "Borrar cuenta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Borrar mi cuenta" })).toBeDisabled();
  await page.keyboard.press("Escape");

  await page.getByRole("main").getByRole("link", { name: "Perfil", exact: true }).click();
  await expect(page).toHaveURL(/\/perfil$/);

  await expectNoHorizontalScroll(page, ["/perfil", "/perfil/ajustes"]);
});
