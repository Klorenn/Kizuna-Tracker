import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { logIn, PASSWORD, randomHandle } from "./helpers";

test.skip(!process.env.E2E_SUPABASE || !process.env.GROUP_SHOTS, "screenshots: needs a local Supabase and GROUP_SHOTS=<dir>");

const DIR = process.env.GROUP_SHOTS ?? "";

async function mk(prefix: string, first: string) {
  const handle = randomHandle(prefix);
  const { data, error } = await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.admin.createUser({
    email: `${handle}@example.com`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username: handle, first_name: first, last_name: "Demo", birth_date: "1995-05-05", timezone: "America/Santiago", terms_accepted: true },
  });
  expect(error).toBeNull();
  return { id: data.user!.id, handle };
}

/** One shot per colour scheme, at the page's current state. */
async function shoot(page: Page, name: string) {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${DIR}/${name}-${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

test("groups screenshots at 375 px, light and dark", async ({ browser }) => {
  mkdirSync(DIR, { recursive: true });
  const [a, b] = await Promise.all([mk("sha", "Ana"), mk("shb", "Beto")]);
  const mkPage = async (who: { handle: string }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await ctx.addInitScript(() => Object.defineProperty(navigator, "mediaDevices", { value: undefined }));
    const page = await ctx.newPage();
    await logIn(page, `@${who.handle}`, PASSWORD);
    return { ctx, page };
  };
  const A = await mkPage(a);
  const B = await mkPage(b);
  const pa = A.page;
  const pb = B.page;

  await pa.goto("/grupos");
  await expect(pa.getByText("Todavía no estás en ningún grupo.")).toBeVisible();
  await shoot(pa, "01-grupos-vacio");

  await pa.goto("/grupos/nuevo");
  await pa.getByLabel("Nombre del grupo").fill("Gimnasio del barrio");
  await pa.getByRole("textbox", { name: "Compromiso" }).fill("Entrenar");
  await pa.getByRole("switch", { name: "Pedir foto como prueba" }).click();
  await shoot(pa, "02-crear-grupo");
  await pa.getByRole("button", { name: "Crear grupo" }).click();
  await expect(pa).toHaveURL(/\/grupos\/[0-9a-f-]{36}$/);
  const groupUrl = pa.url();

  await pa.goto("/grupos");
  await expect(pa.getByText("Gimnasio del barrio")).toBeVisible();
  await shoot(pa, "03-grupos-un-grupo");

  await pa.goto(groupUrl);
  await pa.getByRole("radio", { name: "Miembros" }).click();
  await pa.getByRole("button", { name: "Invitar", exact: true }).click();
  const dialog = pa.getByRole("dialog", { name: "Invitar al grupo" });
  const link = await dialog.getByLabel("Enlace de invitación").inputValue();
  await expect(dialog.getByLabel("Código de invitación")).toBeVisible();
  await shoot(pa, "09-miembros-invitar");
  const invite = new URL(link).pathname;

  // the invitation, signed out and signed in
  const out = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const po = await out.newPage();
  await po.goto(invite);
  await expect(po.getByRole("heading", { name: /Te invitaron a/ })).toBeVisible();
  await shoot(po, "04-invitacion-sin-sesion");
  await out.close();
  await pb.goto(invite);
  await expect(pb.getByRole("button", { name: "Unirme" })).toBeVisible();
  await shoot(pb, "05-invitacion-con-sesion");
  await pb.getByRole("button", { name: "Unirme" }).click();
  await expect(pb).toHaveURL(/\/grupos\/[0-9a-f-]{36}$/);

  // B's photo check-in
  await pb.goto("/");
  await expect(pb.getByRole("img", { name: "Grupo Gimnasio del barrio" })).toBeVisible();
  await shoot(pb, "10-hoy-con-chip");
  const jpeg = await pb.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 96;
    c.height = 96;
    const g = c.getContext("2d")!;
    g.fillStyle = "#5a5ac2";
    g.fillRect(0, 0, 96, 96);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  await pb.getByRole("link", { name: "Foto", exact: true }).first().click();
  await pb.locator('input[type="file"]').setInputFiles({ name: "p.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpeg, "base64") });
  await pb.getByRole("button", { name: "Usar esta foto" }).click();
  await expect(pb).not.toHaveURL(/\/foto$/);

  await pa.goto(groupUrl);
  await shoot(pa, "06-detalle-tablero");
  await pa.getByRole("radio", { name: "Muro" }).click();
  await expect(pa.getByRole("img", { name: /Foto de/ })).toBeVisible();
  await shoot(pa, "07-detalle-muro");
  await pa.getByRole("radio", { name: "Miembros" }).click();
  await shoot(pa, "08-detalle-miembros");

  await pb.goto("/retos");
  await shoot(pb, "11-retos-con-switch");

  await A.ctx.close();
  await B.ctx.close();
});
