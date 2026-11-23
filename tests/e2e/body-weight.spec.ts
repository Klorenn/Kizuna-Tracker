import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, randomHandle, signUp } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase (E2E_SUPABASE=1)");

test("a new user logs a weight, sees it on Perfil and /resumen/peso, edits height and deletes the entry", async ({
  page,
  browser,
}) => {
  const handle = randomHandle("cuerpo");
  await signUp(page, handle);

  await page.goto("/perfil");
  const card = page.getByRole("region", { name: "Cuerpo" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Solo tú")).toBeVisible();
  await expect(card.getByText("Aún no registras tu peso.")).toBeVisible();

  // comma input, today by default
  await card.getByRole("button", { name: "Registrar peso" }).click();
  const weightSheet = page.getByRole("dialog", { name: "Registrar peso" });
  await weightSheet.getByLabel("Peso (kg)").fill("72,4");
  await weightSheet.getByRole("button", { name: "Guardar peso" }).click();
  await expect(weightSheet).toHaveCount(0);
  await expect(card.getByText("72,4 kg").first()).toBeVisible();
  await expect(card.getByText("Aún no registras tu peso.")).toHaveCount(0);

  // a past day with a point, and an out-of-range value is refused with neutral copy
  await card.getByRole("button", { name: "Registrar peso" }).click();
  const again = page.getByRole("dialog", { name: "Registrar peso" });
  await again.getByLabel("Peso (kg)").fill("5");
  await again.getByRole("button", { name: "Guardar peso" }).click();
  await expect(again.getByText("Escribe un peso entre 20 y 400 kg.")).toBeVisible();
  const past = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  await again.getByLabel("Peso (kg)").fill("73.1");
  await again.getByLabel("Fecha").fill(past);
  await again.getByRole("button", { name: "Guardar peso" }).click();
  await expect(again).toHaveCount(0);
  await expect(card.getByText("73,1 kg")).toBeVisible();

  // height
  await card.getByRole("button", { name: "Editar altura" }).click();
  const heightSheet = page.getByRole("dialog", { name: "Editar altura" });
  await heightSheet.getByLabel("Altura (cm)").fill("172,5");
  await heightSheet.getByRole("button", { name: "Guardar altura" }).click();
  await expect(heightSheet).toHaveCount(0);
  await expect(card.getByText("172,5 cm")).toBeVisible();

  // drill-down
  await card.getByRole("link", { name: "Ver evolución" }).click();
  await expect(page).toHaveURL(/\/resumen\/peso$/);
  await expect(page.getByRole("heading", { name: "Peso", level: 1 })).toBeVisible();
  await expect(page.getByText("Solo tú")).toBeVisible();
  await expect(page.getByRole("img", { name: /Evolución del peso: 2 registros/ })).toBeVisible();
  for (const chip of ["3 m", "6 m", "1 año", "Todo"]) {
    await expect(page.getByRole("link", { name: chip, exact: true })).toBeVisible();
  }
  await page.getByRole("link", { name: "Todo", exact: true }).click();
  await expect(page).toHaveURL(/rango=todo/);
  await expect(page.getByRole("heading", { name: "Por mes", level: 2 })).toBeVisible();
  await expectNoHorizontalScroll(page, ["/perfil", "/resumen/peso"]);

  // delete from the drill-down list, with confirmation
  await page.goto("/resumen/peso");
  await page.getByRole("button", { name: /^Borrar el registro del/ }).first().click();
  const confirm = page.getByRole("dialog", { name: "Borrar registro" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Borrar registro" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole("img", { name: /Evolución del peso: 1 registro/ })).toBeVisible();

  // delete the last one from Perfil: back to the empty state, height stays
  await page.goto("/perfil");
  await page.getByRole("button", { name: /^Borrar el registro del/ }).first().click();
  await page.getByRole("dialog", { name: "Borrar registro" }).getByRole("button", { name: "Borrar registro" }).click();
  await expect(page.getByRole("region", { name: "Cuerpo" }).getByText("Aún no registras tu peso.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Cuerpo" }).getByText("172,5 cm")).toBeVisible();

  // privacy: an anonymous visitor to the public profile sees nothing about the body
  const anon = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT || 3000}` });
  const visitor = await anon.newPage();
  await visitor.goto(`/@${handle}`);
  await visitor.waitForLoadState("networkidle");
  await expect(visitor.getByText(/172,5| cm\b| kg\b/)).toHaveCount(0);
  await anon.close();
});
