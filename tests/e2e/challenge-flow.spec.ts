import { expect, test, type Page } from "@playwright/test";
import { createPresetHabit, expectNoHorizontalScroll, randomHandle, signUp } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase (E2E_SUPABASE=1)");

test("signup, habit from a preset, invite link, challenge proposal and acceptance, debts", async ({ browser }) => {
  const ctxA = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  // Force the clipboard fallback so the invite URL can be read back.
  await ctxA.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const handleA = randomHandle("ana");
  const handleB = randomHandle("beto");

  await signUp(a, handleA, "Ana");
  await signUp(b, handleB, "Beto");
  await createPresetHabit(a, "Agua");
  await createPresetHabit(b, "Leer");

  // A creates an invite link; B opens it: viewing does not accept, the POST button does.
  await a.goto("/amigos");
  await a.getByRole("button", { name: "Invitar con un link" }).click();
  await expect(a.getByText("Link copiado")).toBeVisible();
  const inviteUrl = await a.evaluate(() => navigator.clipboard.readText());
  expect(inviteUrl).toMatch(/\/invite\/[a-f0-9]+$/);
  const invitePath = new URL(inviteUrl).pathname;

  await b.goto(invitePath);
  await expect(b.getByText(`@${handleA}`)).toBeVisible();
  await b.goto("/amigos");
  await expect(b.getByText("Tus amigos")).toHaveCount(0);
  await b.goto(invitePath);
  await b.getByRole("button", { name: "Aceptar invitación" }).click();
  await expect(b).toHaveURL(new RegExp(`/amigos\\?amigo=${handleA}$`));
  await expect(b.getByText(`Ya son amigos con @${handleA}.`)).toBeVisible();
  await a.goto("/amigos");
  await expect(a.getByText(`@${handleB}`)).toBeVisible();

  // A proposes a weekly challenge from the habit detail (habit locked).
  await a.goto("/");
  await a.getByRole("link", { name: /Agua/ }).first().click();
  await a.getByRole("link", { name: "Retar a un amigo" }).click();
  await expect(a.getByRole("heading", { name: "Retar a un amigo" })).toBeVisible();
  await expect(a.getByLabel("Bloqueado")).toBeVisible();
  await a.getByLabel("Amigo").selectOption({ label: `Beto E2E · @${handleB}` });
  await a.getByLabel("Multa por falla (CLP)").fill("2500");
  await a.getByRole("button", { name: "Enviar reto a Beto" }).click();
  await expect(a).toHaveURL(/\/retos$/);
  await expect(a.getByText("Propuestos", { exact: true })).toBeVisible();

  // B accepts with their own habit.
  await b.goto("/retos");
  await expect(b.getByText("Ana te propone un reto")).toBeVisible();
  await b.getByRole("button", { name: "Aceptar", exact: true }).click();
  await expect(b.getByRole("radio", { name: /Leer/ })).toBeVisible();
  await b.getByRole("radio", { name: /Leer/ }).click();
  await b.getByRole("button", { name: "Aceptar reto" }).click();
  await expect(b.getByText("Activos", { exact: true })).toBeVisible();
  await a.goto("/retos");
  await expect(a.getByText("Activos", { exact: true })).toBeVisible();

  // Debts page renders (no debts yet) and main screens fit 375 px.
  await a.goto("/perfil");
  await a.getByRole("link", { name: /Deudas/ }).click();
  await expect(a.getByRole("heading", { name: "Deudas" })).toBeVisible();
  await expect(a.getByText("Aún no tienes deudas.")).toBeVisible();
  await expectNoHorizontalScroll(a, ["/", "/amigos", "/retos", "/resumen", "/perfil", "/deudas", "/habitos/nuevo", "/retos/nuevo"]);

  await ctxA.close();
  await ctxB.close();
});

/** Custom habit by name (the "Otro" chip), landing on Hoy. */
async function createCustomHabit(page: Page, name: string) {
  await page.goto("/habitos/nuevo");
  await page.getByRole("button", { name: "Otro", exact: true }).click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByRole("button", { name: "Crear hábito" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: new RegExp(name) }).first()).toBeVisible();
}

async function befriend(a: Page, b: Page, handleA: string, handleB: string, nameB: string) {
  await a.goto(`/amigos/explorar?q=${handleB}`);
  const row = a.getByRole("listitem").filter({ hasText: `@${handleB}` });
  await row.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(row.getByText("Solicitud enviada")).toBeVisible();
  await b.goto("/amigos");
  await b.getByRole("button", { name: `Aceptar a ${nameB}` }).click();
  await expect(b.getByText(`@${handleA}`)).toBeVisible();
}

/** A proposes the habit `habit` to B from its page: weekly, 4 per week minus `lower`. */
async function propose(a: Page, habit: string, handleB: string, nameB: string, lower = 0) {
  await a.goto("/");
  await a.getByRole("link", { name: new RegExp(habit) }).first().click();
  await a.getByRole("link", { name: "Retar a un amigo" }).click();
  await a.getByLabel("Amigo").selectOption({ label: `${nameB} E2E · @${handleB}` });
  for (let i = 0; i < lower; i++) await a.getByRole("button", { name: "Menos: Veces por semana" }).click();
  await a.getByLabel("Multa por falla (CLP)").fill("2500");
  await a.getByRole("button", { name: `Enviar reto a ${nameB}` }).click();
  await expect(a).toHaveURL(/\/retos$/);
}

test("accepting a challenge for a habit you do not have creates it in one step", async ({ browser }) => {
  const ctxA = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const ctxB = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const handleA = randomHandle("eva");
  const handleB = randomHandle("fede");
  await signUp(a, handleA, "Eva");
  await signUp(b, handleB, "Fede");
  await createCustomHabit(a, "Valorant");
  await createPresetHabit(a, "Agua");
  await createPresetHabit(b, "Leer");
  await befriend(a, b, handleA, handleB, "Fede E2E");

  // B has no "Valorant": the sheet offers "Crear" first and selected, then "Mis hábitos"
  await propose(a, "Valorant", handleB, "Fede", 1);
  await b.goto("/retos");
  await expect(b.getByText("Eva te propone un reto")).toBeVisible();
  await expect(b.getByText("3 por semana · 4 semanas")).toBeVisible();
  await expect(b.getByText("Solo marcar")).toBeVisible();
  await b.getByRole("button", { name: "Aceptar", exact: true }).click();
  const create = b.getByRole("radio", { name: /Crear «Valorant»/ });
  await expect(create).toHaveAttribute("aria-checked", "true");
  await expect(b.getByText("Hábito nuevo · 3 por semana")).toBeVisible();
  await expect(b.getByText("Mis hábitos", { exact: true })).toBeVisible();
  await expect(b.getByRole("radio", { name: /Leer/ })).toHaveAttribute("aria-checked", "false");
  await b.getByRole("button", { name: "Aceptar reto" }).click();
  await expect(b.getByText("Activos", { exact: true })).toBeVisible();

  // B's Hoy has exactly one "Valorant", with the challenge's weekly target
  await b.goto("/");
  await expect(b.getByRole("link", { name: /Valorant/ })).toHaveCount(1);
  await expect(b.getByText("0 de 3 esta semana")).toBeVisible();
  await a.goto("/retos");
  await expect(a.getByText("Activos", { exact: true })).toBeVisible();

  // another challenge, accepted with B's existing habit: the unchanged flow
  await propose(a, "Agua", handleB, "Fede");
  await b.goto("/retos");
  await b.getByRole("button", { name: "Aceptar", exact: true }).click();
  await expect(b.getByRole("radio", { name: /Crear «Agua»/ })).toHaveAttribute("aria-checked", "true");
  await b.getByRole("radio", { name: /Leer/ }).click();
  await b.getByRole("button", { name: "Aceptar reto" }).click();
  await expect(b.getByText("Propuestos", { exact: true })).toHaveCount(0);
  await b.goto("/");
  await expect(b.getByRole("link", { name: /Agua/ })).toHaveCount(0);

  await expectNoHorizontalScroll(b, ["/retos", "/"]);
  await ctxA.close();
  await ctxB.close();
});

test("friend request by @usuario is accepted from Solicitudes", async ({ browser }) => {
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const handleA = randomHandle("cami");
  const handleB = randomHandle("dani");

  await signUp(a, handleA, "Cami");
  await signUp(b, handleB, "Dani");

  // the search box now opens Explorar with the term (an old /amigos?q= link lands there too)
  await a.goto("/amigos");
  await a.getByPlaceholder("Buscar por nombre o @usuario").fill(handleB);
  await a.keyboard.press("Enter");
  await expect(a).toHaveURL(new RegExp(`/amigos/explorar\\?q=${handleB}$`));
  const row = a.getByRole("listitem").filter({ hasText: `@${handleB}` });
  await row.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(row.getByText("Solicitud enviada")).toBeVisible();

  await b.goto("/amigos");
  await b.getByRole("button", { name: "Aceptar a Cami E2E" }).click();
  await expect(b.getByText("Tus amigos", { exact: true })).toBeVisible();
  await expect(b.getByText(`@${handleA}`)).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
