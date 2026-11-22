import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, logIn, SEED_PASSWORD } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase seeded with supabase/seed.sql (E2E_SUPABASE=1)");

test("seeded user_a logs in by @usuario and sees habits, debt and no horizontal scroll", async ({ page }) => {
  await logIn(page, "@user_a", SEED_PASSWORD);
  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Leer/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Gimnasio/ }).first()).toBeVisible();

  await page.goto("/deudas");
  await expect(page.getByRole("heading", { name: "Deudas" })).toBeVisible();
  await expect(page.getByText("Beto").first()).toBeVisible();
  await expect(page.getByText("$2.500").first()).toBeVisible();

  await expectNoHorizontalScroll(page, ["/", "/amigos", "/retos", "/resumen", "/perfil", "/metas", "/deudas", "/notificaciones"]);
});

test("seeded user_b logs in by email and sees the active challenge", async ({ page }) => {
  await logIn(page, "user_b@example.com", SEED_PASSWORD);
  await page.goto("/retos");
  await expect(page.getByRole("heading", { name: "Retos", level: 1 })).toBeVisible();
  await expect(page.getByText("Activos", { exact: true })).toBeVisible();
  await page.goto("/deudas");
  await expect(page.getByText("Ana").first()).toBeVisible();
});
