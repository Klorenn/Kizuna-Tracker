import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { logIn, PASSWORD, randomHandle } from "./helpers";

// Written in phase 42a and NOT run yet: it needs migration 0025 (the optional fine) applied locally.
test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase (E2E_SUPABASE=1) with migration 0025 applied");

const RULE = "La app solo registra. El pago se hace fuera de la app.";
const WIDTH = 375;

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;

function admin() {
  return createClient(url(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type U = { id: string; handle: string; name: string };

/** Own users (service role is test tooling only). Display name is "<first> E2E". */
async function mk(prefix: string, first: string): Promise<U> {
  const handle = randomHandle(prefix);
  const { data, error } = await admin().auth.admin.createUser({
    email: `${handle}@example.com`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      username: handle,
      first_name: first,
      last_name: "E2E",
      birth_date: "1995-05-05",
      timezone: "America/Santiago",
      terms_accepted: true,
    },
  });
  expect(error).toBeNull();
  return { id: data.user!.id, handle, name: `${first} E2E` };
}

const tag = () => Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 6).padEnd(6, "x");

/** A browser context with a signed-in page, 375 px wide. */
async function session(browser: Browser, u: U): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 812 } });
  // no camera in the test browser: the photo page falls back to the file input
  await ctx.addInitScript(() => Object.defineProperty(navigator, "mediaDevices", { value: undefined }));
  const page = await ctx.newPage();
  await logIn(page, `@${u.handle}`, PASSWORD);
  return { ctx, page };
}

/** Creates a group with a photo commitment and returns its id. */
async function createGroup(page: Page, name: string, commitment: string) {
  await page.goto("/grupos/nuevo");
  await page.getByLabel("Nombre del grupo").fill(name);
  await page.getByRole("textbox", { name: "Compromiso" }).fill(commitment);
  await page.getByRole("switch", { name: "Pedir foto como prueba" }).click();
  await expect(page.getByRole("radio", { name: new RegExp(`Crear «${commitment}»`) })).toBeChecked();
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await expect(page).toHaveURL(/\/grupos\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return page.url().split("/").pop()!;
}

/** An admin opens "Invitar" in Miembros and reads the link out of the sheet (a path). */
async function inviteLink(page: Page, groupId: string) {
  await page.goto(`/grupos/${groupId}`);
  await page.getByRole("radio", { name: "Miembros" }).click();
  await page.getByRole("button", { name: "Invitar", exact: true }).click();
  const link = await page.getByRole("dialog", { name: "Invitar al grupo" }).getByLabel("Enlace de invitación").inputValue();
  expect(link).toMatch(/\/g\/[2-9A-HJ-NP-Z]{8}$/);
  return new URL(link).pathname;
}

/** A signed-in person opens the link and joins with the default choice (a new habit), before any fine exists. */
async function join(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole("button", { name: "Unirme" }).click();
  await expect(page).toHaveURL(/\/grupos\/[0-9a-f-]{36}(\?seccion=fondo)?$/);
}

type Section = "Tablero" | "Muro" | "Miembros" | "Fondo";
const showSection = (page: Page, name: Section) => page.getByRole("radio", { name }).click();

/** No horizontal overflow at 375 px, in light and in dark. */
async function expectFits(page: Page, label: string) {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, `${label} (${scheme})`).toBeLessThanOrEqual(WIDTH);
  }
  await page.emulateMedia({ colorScheme: "light" });
}

/** The content of an open sheet does not scroll sideways either (a fixed sheet is invisible to the page's scrollWidth). */
async function expectSheetFits(sheet: Locator, label: string) {
  const [scroll, client] = await sheet.evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(scroll, `${label}: sheet content`).toBeLessThanOrEqual(client);
}

/** A tiny generated JPEG, sent through the photo page of a habit. */
async function sendPhoto(page: Page, habitHref: string) {
  const jpeg = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#5a5ac2";
    g.fillRect(0, 0, 64, 64);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  await page.goto(habitHref);
  await page.locator('input[type="file"]').setInputFiles({
    name: "proof.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(jpeg, "base64"),
  });
  await page.getByRole("button", { name: "Usar esta foto" }).click();
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** The Monday of the current week in Santiago, as "YYYY-MM-DD". */
function mondayOfThisWeek(): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return day(d);
}

test("propose, vote and activate a fine; reject and undo a photo; a closed week becomes a debt that an admin marks paid", async ({ browser }) => {
  test.setTimeout(240_000);
  const [a, b, c, d] = await Promise.all([mk("gfa", "Ana"), mk("gfb", "Beto"), mk("gfc", "Carla"), mk("gfd", "Diego")]);
  const [A, B, C, D] = await Promise.all([session(browser, a), session(browser, b), session(browser, c), session(browser, d)]);
  const [pa, pb, pc, pd] = [A.page, B.page, C.page, D.page];
  const name = `Multa ${tag()}`;
  const groupId = await createGroup(pa, name, `Entrenar ${tag()}`);
  const invite = await inviteLink(pa, groupId);
  await join(pb, invite);
  await join(pc, invite);

  // --- the Fondo section: admins always, members only when there is something to see
  await pa.goto(`/grupos/${groupId}`);
  await expect(pa.getByRole("radio", { name: "Fondo" })).toBeVisible();
  await expect(pb.getByRole("radio", { name: "Fondo" })).toHaveCount(0);
  await showSection(pa, "Fondo");
  await expect(pa.getByText("Este grupo no tiene multa.")).toBeVisible();

  // --- A proposes $2.500 "Asado de fin de mes"
  await pa.getByRole("button", { name: "Proponer multa" }).click();
  const sheet = pa.getByRole("dialog", { name: "Proponer multa" });
  await expect(sheet.getByText(RULE)).toBeVisible();
  await expectFits(pa, "proposal sheet");
  await expectSheetFits(sheet, "proposal sheet");
  await sheet.getByLabel("Monto por semana incumplida (CLP)").fill("2500");
  await sheet.getByLabel("¿Para qué es el fondo?").fill("Asado de fin de mes");
  await sheet.getByRole("button", { name: "Proponer", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(pa.getByText(/propone una multa de \$2\.500 por semana incumplida/)).toBeVisible();
  await expect(pa.getByText(RULE).first()).toBeVisible();
  await expectFits(pa, "fund section with the vote card");

  // --- C declines first (so the count is still open), then B accepts and the fine is approved
  await pc.goto(`/grupos/${groupId}`);
  await showSection(pc, "Fondo");
  await expect(pc.getByText(RULE).first()).toBeVisible();
  await expectFits(pc, "vote card");
  await pc.getByRole("button", { name: "No participar" }).click();
  await expect(pc.getByText("No participas").first()).toBeVisible();
  await pa.reload();
  await showSection(pa, "Fondo");
  // 3 members, the proposer counts, C declined: 1 of the 2 needed
  await expect(pa.getByText("Aceptaron 1 de 2 necesarios")).toBeVisible();

  await pb.goto(`/grupos/${groupId}`);
  await showSection(pb, "Fondo");
  await pb.getByRole("button", { name: "Aceptar", exact: true }).click();
  await expect(pb.getByText(/Multa activa:/)).toBeVisible();

  // the fine shows as approved, with the Monday it starts from the database
  const { data: fine } = await admin().from("group_fines").select("starts_on").eq("group_id", groupId).eq("status", "active").single();
  const startDay = Number(fine!.starts_on.slice(8));
  await pa.goto(`/grupos/${groupId}`);
  await showSection(pa, "Fondo");
  await expect(pa.getByText(/Multa activa:/)).toBeVisible();
  await expect(pa.getByText(new RegExp(`Participas desde el lunes ${startDay} `))).toBeVisible();
  await expect(pa.getByText("Fondo: Asado de fin de mes")).toBeVisible();
  await expect(pa.getByText(RULE).first()).toBeVisible();
  await expectFits(pa, "fund section with the active fine");
  // C declined: the fine does not bind them
  await pc.reload();
  await showSection(pc, "Fondo");
  await expect(pc.getByText("No participas").first()).toBeVisible();

  // --- backdate the group by one week, so that last week can be closed later with A and B bound and not complying.
  // (It also makes the members count from last Monday, so the board shows their count of this week.)
  // Produced by BACKDATING the group by one week through the service role (test tooling) and then calling
  // close_due_group_weeks() with the real clock: it closes exactly the week that has just ended, and only for groups
  // whose week is due, so it does not touch other specs' groups. A global call with a future p_now would close every group.
  const lastWeek = day(new Date(new Date(`${mondayOfThisWeek()}T12:00:00Z`).getTime() - 7 * 86_400_000));
  const db = admin();
  const stamp = `${lastWeek}T12:00:00Z`;
  expect((await db.from("groups").update({ created_at: stamp }).eq("id", groupId)).error).toBeNull();
  expect((await db.from("group_members").update({ counts_from: lastWeek, joined_on: lastWeek, joined_at: stamp }).eq("group_id", groupId)).error).toBeNull();
  expect((await db.from("group_fines").update({ starts_on: lastWeek }).eq("group_id", groupId).eq("status", "active")).error).toBeNull();
  expect((await db.from("group_fine_members").update({ bound_from: lastWeek }).eq("group_id", groupId)).error).toBeNull();


  // --- B checks in with a photo; A rejects it with a reason; B sees the reason, C does not; A undoes it
  await pb.goto("/");
  await pb.getByRole("link", { name: "Foto", exact: true }).first().click();
  await expect(pb).toHaveURL(/\/habitos\/[0-9a-f-]{36}\/foto$/);
  await sendPhoto(pb, pb.url());
  await expect(pb).not.toHaveURL(/\/foto$/);

  const bRow = (page: Page) => page.getByRole("region", { name: "Tablero" }).getByRole("listitem").filter({ hasText: b.name });
  await pa.goto(`/grupos/${groupId}`);
  await expect(bRow(pa)).toContainText("1 de 3");
  await showSection(pa, "Muro");
  await expect(pa.getByRole("img", { name: new RegExp(`Foto de ${b.name}`) })).toBeVisible();
  await pa.getByRole("button", { name: `Rechazar foto de ${b.name}` }).click();
  const reject = pa.getByRole("dialog", { name: "Rechazar foto" });
  await expectFits(pa, "wall with the reject sheet");
  await expectSheetFits(reject, "reject sheet");
  await reject.getByLabel("Motivo (lo verá solo esa persona)").fill("Foto borrosa");
  await reject.getByRole("button", { name: "Rechazar", exact: true }).click();
  await expect(reject).toHaveCount(0);
  const rejectedA = pa.getByRole("region", { name: "Fotos rechazadas" });
  await expect(rejectedA.getByText("Foto borrosa")).toBeVisible();
  await expect(rejectedA.getByRole("button", { name: "Deshacer rechazo" })).toBeVisible();
  // a rejected photo is off the wall and no longer counts
  await expect(pa.getByRole("img", { name: /Foto de/ })).toHaveCount(0);
  await showSection(pa, "Tablero");
  await expect(bRow(pa)).toContainText("0 de 3");
  await showSection(pa, "Muro");

  await pb.goto(`/grupos/${groupId}`);
  await showSection(pb, "Muro");
  const rejectedB = pb.getByRole("region", { name: "Fotos rechazadas" });
  await expect(rejectedB.getByText("Foto borrosa")).toBeVisible();
  await expect(rejectedB.getByRole("button", { name: "Deshacer rechazo" })).toHaveCount(0);

  await pc.goto(`/grupos/${groupId}`);
  await showSection(pc, "Muro");
  await expect(pc.getByText("Foto borrosa")).toHaveCount(0);
  await expect(pc.getByRole("region", { name: "Fotos rechazadas" })).toHaveCount(0);

  await rejectedA.getByRole("button", { name: "Deshacer rechazo" }).click();
  await expect(pa.getByRole("img", { name: new RegExp(`Foto de ${b.name}`) })).toBeVisible();
  await expect(pa.getByText("Foto borrosa")).toHaveCount(0);
  await showSection(pa, "Tablero");
  await expect(bRow(pa)).toContainText("1 de 3");

  // --- close last week: A and B were bound and did not comply. The closing function handles at most 500 groups per run
  // (oldest first), so call it until this group's week is there.
  const closeLastWeek = async () => {
    for (let i = 0; i < 3; i++) {
      expect((await db.rpc("close_due_group_weeks")).error).toBeNull();
      const { data } = await db.from("group_weeks").select("week_start").eq("group_id", groupId).eq("week_start", lastWeek);
      if (data && data.length > 0) return;
    }
    throw new Error("last week did not close");
  };
  await closeLastWeek();
  const { data: debts } = await db.from("group_fund_debts").select("debtor_id").eq("group_id", groupId);
  expect((debts ?? []).map((x) => x.debtor_id).sort()).toEqual([a.id, b.id].sort());

  // B owes $2.500 to the fund, in Deudas under "Fondos de grupo", and the line of the rule is there
  await pb.goto("/deudas");
  await expect(pb.getByText("Fondos de grupo")).toBeVisible();
  await expect(pb.getByText(`Le debes $2.500 al fondo de ${name}`)).toBeVisible();
  await expect(pb.getByRole("link", { name: new RegExp(`Le debes \\$2\\.500 al fondo de ${name}`) })).toHaveAttribute("href", new RegExp(`/grupos/${groupId}`));
  await expect(pb.getByText(RULE).first()).toBeVisible();
  await expectFits(pb, "Deudas with a group fund");
  // C was not bound: nothing owed
  await pc.goto("/deudas");
  await expect(pc.getByText("Fondos de grupo")).toHaveCount(0);

  // A marks B's debt as paid: the app only records it
  await pa.goto(`/grupos/${groupId}`);
  await showSection(pa, "Fondo");
  const row = pa.getByRole("listitem").filter({ hasText: b.name }).filter({ has: pa.getByRole("button", { name: "Marcar como pagada" }) });
  await row.getByRole("button", { name: "Marcar como pagada" }).click();
  await expect(pa.getByText(`Pagada · marcó ${a.name}`)).toBeVisible();
  await pb.goto("/deudas");
  await expect(pb.getByText(`Le debes $2.500 al fondo de ${name}`)).toHaveCount(0);

  // --- the invitation of a group with a fine in force shows it; joining lands on the fund
  const code = invite.split("/").pop()!;
  await pd.goto(`/g/${code}`);
  await expect(pd.getByText(/Multa: \$2\.500 por semana incumplida/)).toBeVisible();
  await expect(pd.getByText("Para: Asado de fin de mes")).toBeVisible();
  await expect(pd.getByText("La multa solo aplica si la aceptas.")).toBeVisible();
  await expect(pd.getByText(RULE)).toBeVisible();
  await expectFits(pd, "invitation with a fine");
  await pd.getByRole("button", { name: "Unirme" }).click();
  await expect(pd).toHaveURL(new RegExp(`/grupos/${groupId}\\?seccion=fondo&unido=1$`));

  // the question: "Ahora no" binds nothing and closes the card; the normal fund section follows
  await expect(
    pd.getByText(/Este grupo tiene una multa de \$2\.500 por cada semana que no cumplas\. Va al fondo: Asado de fin de mes\. Solo aplica si la aceptas\./),
  ).toBeVisible();
  await expect(pd.getByText(RULE).first()).toBeVisible();
  await expectFits(pd, "join question");
  await pd.getByRole("button", { name: "Ahora no" }).click();
  await expect(pd.getByRole("button", { name: "Aceptar multa" })).toHaveCount(0);
  await expect(pd.getByText("No participas").first()).toBeVisible();
  const { data: dBound } = await db.from("group_fine_members").select("user_id").eq("group_id", groupId).eq("user_id", d.id);
  expect(dBound ?? []).toHaveLength(0);

  // reloading without ?unido=1 shows no question; accepting from the fund binds from next Monday
  await pd.goto(`/grupos/${groupId}?seccion=fondo`);
  await expect(pd.getByRole("button", { name: "Aceptar multa" })).toHaveCount(0);
  await pd.getByRole("button", { name: "Sumarme desde el próximo lunes" }).click();
  await expect(pd.getByText(/Participas desde el lunes/)).toBeVisible();

  await Promise.all([A.ctx.close(), B.ctx.close(), C.ctx.close(), D.ctx.close()]);
});
