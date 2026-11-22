import { expect, test } from "@playwright/test";
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

test("friend request by @usuario is accepted from Solicitudes", async ({ browser }) => {
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const handleA = randomHandle("cami");
  const handleB = randomHandle("dani");

  await signUp(a, handleA, "Cami");
  await signUp(b, handleB, "Dani");

  await a.goto(`/amigos?q=${handleB}`);
  await a.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(a.getByText("Solicitud enviada")).toBeVisible();

  await b.goto("/amigos");
  await b.getByRole("button", { name: "Aceptar a Cami E2E" }).click();
  await expect(b.getByText("Tus amigos", { exact: true })).toBeVisible();
  await expect(b.getByText(`@${handleA}`)).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
