import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase seeded with supabase/seed.sql (E2E_SUPABASE=1)");

test("public profile shows public habits only and never requests photos", async ({ page }) => {
  const proofRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/storage/v1/object/sign/proofs")) proofRequests.push(r.url());
  });

  await page.goto("/@user_a");
  await expect(page.getByRole("heading", { name: "Ana Prueba" })).toBeVisible();
  await expect(page.getByText("Leer", { exact: true })).toBeVisible();
  await expect(page.getByText("Gimnasio")).toHaveCount(0);
  await expect(page.getByText("Las fotos de prueba nunca son públicas.")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(proofRequests).toEqual([]);

  await expectNoHorizontalScroll(page, ["/@user_a"]);

  await page.getByRole("link", { name: "Agregar amigo" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2F%40user_a$/);
});

test("legal pages are public, carry the draft notice and fit 375 px", async ({ page }) => {
  for (const [path, heading] of [
    ["/legal/terminos", "Términos de uso"],
    ["/legal/privacidad", "Política de privacidad"],
  ] as const) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await expect(page.getByText("Borrador pendiente de revisión legal")).toBeVisible();
  }
  await expectNoHorizontalScroll(page, ["/legal/terminos", "/legal/privacidad", "/bienvenida", "/login", "/registro"]);
});
