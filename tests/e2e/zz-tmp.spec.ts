// THROWAWAY (never committed)
import { expect, test } from "@playwright/test";
import { randomHandle, signUp } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs Supabase");

test("session survives reload and navigation", async ({ page }) => {
  test.setTimeout(200_000);
  await signUp(page, randomHandle("tmp"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible();
  await page.getByRole("link", { name: "Amigos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Amigos" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Amigos" })).toBeVisible();
  console.log("SESSION ok");
});
