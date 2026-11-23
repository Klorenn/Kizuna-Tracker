import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, logIn, SEED_PASSWORD } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase seeded with supabase/seed.sql (E2E_SUPABASE=1)");

const BETO_ID = "a0000000-0000-0000-0000-00000000000b";

test("user_a opens Beto from Amigos: grouped activity, friend profile, Retar and the shared challenge", async ({
  page,
}) => {
  await logIn(page, "user_a", SEED_PASSWORD);
  await page.goto("/amigos");

  // feed: day sections (mono labels) with Beto's check-ins
  const activity = page.getByRole("region", { name: "Actividad" });
  await expect(activity.getByRole("heading", { level: 3 }).first()).toBeVisible();
  await expect(activity.getByText("Completó Correr").first()).toBeVisible();
  await expect(activity.getByRole("button", { name: "Todo" })).toHaveAttribute("aria-pressed", "true");

  // friends list row: name, @usuario and a short status
  const friends = page.getByRole("region", { name: "Tus amigos" });
  const beto = friends.getByRole("link", { name: /Beto Prueba/ });
  await expect(beto).toContainText("@user_b");
  await expect(beto).toContainText(/Racha de|Sin racha activa/);
  await beto.click();

  await expect(page).toHaveURL(/\/@user_b$/);
  await expect(page.getByRole("heading", { name: "Beto Prueba", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Retar" })).toHaveAttribute("href", `/retos/nuevo?amigo=${BETO_ID}`);
  await expect(page.getByRole("region", { name: "Retos entre ustedes" }).getByRole("link", { name: /Leer vs Correr/ })).toBeVisible();
  await expect(page.getByText("Correr").first()).toBeVisible();
  await expect(page.getByRole("img", { name: /check-ins en .* días de las últimas 12 semanas/ })).toBeVisible();

  // remove friend asks first, in a sheet with the consequences; cancel keeps the friendship
  await page.getByRole("button", { name: "Más opciones" }).click();
  await page.getByRole("button", { name: /Eliminar amigo/ }).click();
  const sheet = page.getByRole("dialog", { name: "Eliminar a Beto" });
  await expect(sheet.getByText("Se cancelan los retos activos y propuestos entre ustedes.")).toBeVisible();
  await sheet.getByRole("button", { name: "Cancelar" }).click();
  await expect(sheet).toHaveCount(0);

  await expectNoHorizontalScroll(page, ["/@user_b", "/amigos"]);
  for (const width of [360, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/@user_b", "/amigos"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${path} at ${width}`).toBeLessThanOrEqual(width);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // Retar preselects Beto in the challenge form
  await page.goto("/@user_b");
  await page.getByRole("link", { name: "Retar" }).click();
  await expect(page.getByRole("heading", { name: "Retar a Beto" })).toBeVisible();
  await expect(page.getByLabel("Amigo", { exact: true })).toHaveValue(BETO_ID);
});

test("tapping a feed name opens that friend's profile; own handle goes to Perfil", async ({ page }) => {
  await logIn(page, "user_a", SEED_PASSWORD);
  await page.goto("/amigos");
  await page.getByRole("region", { name: "Actividad" }).getByRole("link", { name: "Beto Prueba" }).first().click();
  await expect(page).toHaveURL(/\/@user_b$/);
  await page.goto("/@user_a");
  await expect(page).toHaveURL(/\/perfil$/);
});
