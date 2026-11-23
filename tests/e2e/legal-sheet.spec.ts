import { expect, test } from "@playwright/test";
import { randomHandle } from "./helpers";

test("bienvenida: legal links open a sheet and stay on the page", async ({ page }) => {
  await page.goto("/bienvenida");
  await page.getByRole("button", { name: "Política de privacidad" }).click();
  const dialog = page.getByRole("dialog", { name: "Política de privacidad" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Borrador pendiente de revisión legal")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/bienvenida$/);
});

test.describe("registro", () => {
  test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase (E2E_SUPABASE=1)");

  test("step 5: Términos de uso opens a dialog and keeps the form on /registro", async ({ page }) => {
    const handle = randomHandle("e2e_legal");
    await page.goto("/registro");
    await page.getByLabel("Nombre").fill("Carolina");
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
    await page.getByLabel("Contraseña", { exact: true }).fill("kizuna-2026");

    await page.getByRole("button", { name: "Términos de uso" }).click();
    const dialog = page.getByRole("dialog", { name: "Términos de uso" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Términos de uso" })).toBeVisible();
    await expect(page).toHaveURL(/\/registro$/);

    await dialog.getByRole("button", { name: "Cerrar" }).first().click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel("Contraseña", { exact: true })).toHaveValue("kizuna-2026");
  });
});
