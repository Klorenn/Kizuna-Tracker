import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const BOOLEAN = "Smoke boolean";
const WATER = "Smoke agua";

async function openHoy(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hoy", level: 1 })).toBeVisible();
}

/** A celebration or day-complete sheet may open over Hoy after a check-in: close it. */
async function dismissSheets(page: Page) {
  const dialog = page.getByRole("dialog");
  if (await dialog.first().isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
}

async function hasHabit(page: Page, name: string) {
  return (await page.getByRole("link", { name, exact: true }).count()) > 0;
}

// Habits are created once through the UI and then kept: later runs find them.
test("Hoy renders and the smoke habits exist", async ({ page }) => {
  await openHoy(page);

  if (!(await hasHabit(page, BOOLEAN))) {
    await page.goto("/habitos/nuevo");
    await page.getByLabel("Nombre").fill(BOOLEAN);
    await page.getByRole("button", { name: "Crear hábito" }).click();
    await expect(page).toHaveURL(/\/$/);
  }

  if (!(await hasHabit(page, WATER))) {
    await page.goto("/habitos/nuevo");
    await page.getByRole("button", { name: "Agua", exact: true }).click();
    await page.getByLabel("Nombre").fill(WATER);
    await page.getByRole("button", { name: "Crear hábito" }).click();
    await expect(page).toHaveURL(/\/$/);
  }

  await expect(page.getByRole("link", { name: BOOLEAN, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: WATER, exact: true })).toBeVisible();
});

test("boolean habit: check in, verify done, undo, verify pending", async ({ page }) => {
  await openHoy(page);
  const box = page.getByRole("checkbox", { name: BOOLEAN, exact: true });
  await expect(box).toBeVisible();

  // normalise: a previous aborted run may have left it checked
  if ((await box.getAttribute("aria-checked")) === "true") {
    await box.click();
    await expect(box).toHaveAttribute("aria-checked", "false");
    await dismissSheets(page);
  }

  await box.click();
  await expect(box).toHaveAttribute("aria-checked", "true");
  // survives a reload: it is persisted, not just optimistic
  await page.reload();
  await expect(page.getByRole("checkbox", { name: BOOLEAN, exact: true })).toHaveAttribute("aria-checked", "true");
  await dismissSheets(page);

  await page.getByRole("checkbox", { name: BOOLEAN, exact: true }).click();
  await expect(page.getByRole("checkbox", { name: BOOLEAN, exact: true })).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(page.getByRole("checkbox", { name: BOOLEAN, exact: true })).toHaveAttribute("aria-checked", "false");
});

test("quantity habit: add a glass, counter changes, remove it", async ({ page }) => {
  await openHoy(page);
  const open = async () => {
    await page.getByRole("button", { name: "Más opciones de cantidad" }).click();
    return page.getByRole("dialog", { name: "Cantidad de hoy" });
  };

  let sheet = await open();
  const progress = sheet.locator("p[aria-live]").first();
  const before = (await progress.textContent())?.trim();
  const entriesBefore = await sheet.getByRole("listitem").count();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  await page.getByRole("button", { name: /^Sumar / }).click();

  sheet = await open();
  await expect(sheet.getByRole("listitem")).toHaveCount(entriesBefore + 1);
  await expect(sheet.getByText("guardando")).toHaveCount(0);
  await expect(sheet.locator("p[aria-live]").first()).not.toHaveText(before ?? "");

  await sheet.getByRole("button", { name: "Deshacer la última" }).click();
  await expect(sheet.getByRole("listitem")).toHaveCount(entriesBefore);
  await expect(sheet.locator("p[aria-live]").first()).toHaveText(before ?? "");
});
