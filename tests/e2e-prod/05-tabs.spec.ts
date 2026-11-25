import { expect, test } from "./fixtures";

const TABS = ["Amigos", "Retos", "Resumen", "Perfil"] as const;

test("main tabs load without an error page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hoy", level: 1 })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Principal" });
  for (const tab of TABS) {
    await nav.getByRole("link", { name: tab, exact: true }).click();
    await expect(page.getByRole("heading", { name: tab, level: 1 })).toBeVisible();
    await expect(page.getByText("Algo salió mal")).toHaveCount(0);
  }
});

test("Ajustes loads from Perfil", async ({ page }) => {
  await page.goto("/perfil");
  await page.getByRole("link", { name: "Ajustes" }).click();
  await expect(page).toHaveURL(/\/perfil\/ajustes$/);
  await expect(page.getByRole("heading", { name: "Ajustes", level: 1 })).toBeVisible();
  await expect(page.getByText("Algo salió mal")).toHaveCount(0);
});
