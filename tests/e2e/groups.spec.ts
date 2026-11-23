import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { expectNotFound, logIn, PASSWORD, randomHandle, signUp } from "./helpers";

// Written in phase 1 and NOT run yet: it needs migration 0023 (groups) applied locally.
test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase (E2E_SUPABASE=1) with migration 0023 applied");

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

/** A browser context with a signed-in page, 390 px wide. */
async function session(browser: Browser, u: U): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // no camera in the test browser: the photo page falls back to the file input
  await ctx.addInitScript(() => Object.defineProperty(navigator, "mediaDevices", { value: undefined }));
  const page = await ctx.newPage();
  await logIn(page, `@${u.handle}`, PASSWORD);
  return { ctx, page };
}

/** Creates a group from the form (default choice "Crear «<compromiso>»") and returns its id. */
async function createGroup(page: Page, name: string, commitment: string, opts: { photo?: boolean } = {}) {
  await page.goto("/grupos/nuevo");
  await page.getByLabel("Nombre del grupo").fill(name);
  await page.getByRole("textbox", { name: "Compromiso" }).fill(commitment);
  if (opts.photo) await page.getByRole("switch", { name: "Pedir foto como prueba" }).click();
  await expect(page.getByRole("radio", { name: new RegExp(`Crear «${commitment}»`) })).toBeChecked();
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await expect(page).toHaveURL(/\/grupos\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return page.url().split("/").pop()!;
}

/** An admin opens "Invitar" in Miembros and reads the link out of the sheet. */
async function inviteLink(page: Page, groupId: string) {
  await page.goto(`/grupos/${groupId}`);
  await page.getByRole("radio", { name: "Miembros" }).click();
  await page.getByRole("button", { name: "Invitar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Invitar al grupo" });
  const link = await dialog.getByLabel("Enlace de invitación").inputValue();
  expect(link).toMatch(/\/g\/[2-9A-HJ-NP-Z]{8}$/);
  // the code, as people say it: two groups of four, with its own copy button
  await expect(dialog.getByLabel("Código de invitación")).toHaveValue(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  await expect(dialog.getByRole("button", { name: "Copiar código" })).toBeVisible();
  return new URL(link).pathname;
}

/** A signed-in person opens the link and joins with the default choice (a new habit). */
async function join(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole("button", { name: "Unirme" }).click();
  await expect(page).toHaveURL(/\/grupos\/[0-9a-f-]{36}$/);
}

const board = (page: Page) => page.getByRole("region", { name: "Tablero" }).getByRole("listitem");
const showSection = (page: Page, name: "Tablero" | "Muro" | "Miembros") => page.getByRole("radio", { name }).click();

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

test("a group from creation to leaving: link, preview, join, photo on the wall, strangers out, leave", async ({ browser }) => {
  const [a, b, c] = await Promise.all([mk("gra", "Ana"), mk("grb", "Beto"), mk("grc", "Carla")]);
  const name = `Gym ${tag()}`;
  const commitment = `Entrenar ${tag()}`;
  const A = await session(browser, a);
  const B = await session(browser, b);
  const C = await session(browser, c);
  const pa = A.page;
  const pb = B.page;

  const groupId = await createGroup(pa, name, commitment, { photo: true });
  await expect(pa.getByText(commitment).first()).toBeVisible();
  const invite = await inviteLink(pa, groupId);

  // B is not A's friend. Signed out, B opens the link: the preview, no member names, a way to sign in.
  const out = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const po = await out.newPage();
  // a lower-case, hyphenated variant of the code lands on the canonical URL
  const code = invite.split("/").pop()!;
  await po.goto(`/g/${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase());
  await expect(po).toHaveURL(new RegExp(`/g/${code}$`));
  await expect(po.getByRole("heading", { name: `Te invitaron a ${name}` })).toBeVisible();
  await expect(po.getByText(commitment)).toBeVisible();
  await expect(po.getByText("1 miembro")).toBeVisible();
  await expect(po.getByText("Los miembros verán tus registros y fotos de este hábito.")).toBeVisible();
  await expect(po.getByText(a.name)).toHaveCount(0);
  await expect(po.getByText(`@${a.handle}`)).toHaveCount(0);
  await po.getByRole("link", { name: "Inicia sesión para unirte" }).click();
  await expect(po).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(invite).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  await po.getByLabel("Correo o @usuario").fill(`@${b.handle}`);
  await po.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await po.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(po).toHaveURL(new RegExp(`${invite}$`));
  await po.getByRole("button", { name: "Unirme" }).click();
  await expect(po).toHaveURL(new RegExp(`/grupos/${groupId}$`));
  await out.close();

  // both see the board with two rows
  await pa.goto(`/grupos/${groupId}`);
  await expect(board(pa)).toHaveCount(2);
  await pb.goto(`/grupos/${groupId}`);
  await expect(board(pb)).toHaveCount(2);

  // B's habit for the group is on Hoy with the group chip
  await pb.goto("/");
  await expect(pb.getByRole("img", { name: `Grupo ${name}` })).toBeVisible();

  // B checks in with a photo (the group asks for one); A sees it on the wall
  await pb.getByRole("link", { name: "Foto", exact: true }).first().click();
  await expect(pb).toHaveURL(/\/habitos\/[0-9a-f-]{36}\/foto$/);
  await sendPhoto(pb, pb.url());
  await expect(pb).not.toHaveURL(/\/foto$/);
  await pa.goto(`/grupos/${groupId}`);
  await showSection(pa, "Muro");
  await expect(pa.getByText("Subió su foto")).toBeVisible();
  await expect(pa.getByRole("img", { name: new RegExp(`Foto de ${b.name}`) })).toBeVisible();
  await expect(pa.getByText("Foto no disponible")).toHaveCount(0);

  // C, a stranger: the group is a 404 and the photo cannot be signed
  await expectNotFound(C.page, `/grupos/${groupId}`);
  const { data: proofs } = await admin().from("checkins").select("photo_path").eq("user_id", b.id).not("photo_path", "is", null);
  expect(proofs).toHaveLength(1);
  const stranger = createClient(url(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await stranger.auth.signInWithPassword({ email: `${c.handle}@example.com`, password: PASSWORD })).error).toBeNull();
  const signed = await stranger.storage.from("proofs").createSignedUrl(proofs![0].photo_path!, 60);
  expect(signed.data?.signedUrl ?? null).toBeNull();

  // B leaves: gone from the board, and A no longer sees B's wall items
  await pb.goto(`/grupos/${groupId}`);
  await showSection(pb, "Miembros");
  await pb.getByRole("button", { name: "Salir del grupo" }).click();
  await pb.getByRole("dialog", { name: "Salir del grupo" }).getByRole("button", { name: "Salir del grupo" }).click();
  await expect(pb).toHaveURL(/\/grupos$/);
  await pa.goto(`/grupos/${groupId}`);
  await expect(board(pa)).toHaveCount(1);
  await showSection(pa, "Muro");
  await expect(pa.getByText("Aún no hay registros en este grupo.")).toBeVisible();
  await expect(pa.getByText("Subió su foto")).toHaveCount(0);
  // and B's Hoy chip is gone
  await pb.goto("/");
  await expect(pb.getByRole("img", { name: `Grupo ${name}` })).toHaveCount(0);

  await Promise.all([A.ctx.close(), B.ctx.close(), C.ctx.close()]);
});

test("a check-in made before joining with an existing habit does not appear", async ({ browser }) => {
  const [a, b] = await Promise.all([mk("gpa", "Ana"), mk("gpb", "Beto")]);
  const A = await session(browser, a);
  const B = await session(browser, b);
  const groupId = await createGroup(A.page, `Previo ${tag()}`, `Leer ${tag()}`);
  const invite = await inviteLink(A.page, groupId);

  // B already has a habit with a check-in from three days ago (service role: test tooling)
  const db = admin();
  const { data: habit, error } = await db
    .from("habits")
    .insert({ user_id: b.id, name: "Lectura previa", icon: "book", frequency_type: "daily", color: "arena", visibility: "friends" })
    .select("id")
    .single();
  expect(error).toBeNull();
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  expect((await db.from("checkins").insert({ id: randomUUID(), habit_id: habit!.id, user_id: b.id, local_date: threeDaysAgo })).error).toBeNull();

  // "Tengo un enlace" takes the bare code in any case, with the hyphen
  const code = invite.split("/").pop()!;
  await B.page.goto("/grupos");
  await B.page.getByRole("button", { name: "Tengo un enlace" }).click();
  await B.page.getByLabel("Enlace o código de invitación").fill(`${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase());
  await B.page.getByRole("button", { name: "Continuar" }).click();
  await expect(B.page).toHaveURL(new RegExp(`/g/${code}$`));
  await B.page.getByRole("radio", { name: "Usar uno de mis hábitos" }).click();
  await B.page.getByRole("radio", { name: "Lectura previa" }).click();
  await B.page.getByRole("button", { name: "Unirme" }).click();
  await expect(B.page).toHaveURL(new RegExp(`/grupos/${groupId}$`));

  await A.page.goto(`/grupos/${groupId}`);
  await expect(board(A.page)).toHaveCount(2);
  await showSection(A.page, "Muro");
  await expect(A.page.getByText("Aún no hay registros en este grupo.")).toBeVisible();

  // the habit is now taken: a second group cannot use it
  await B.page.goto("/grupos/nuevo");
  // the only habit B has is linked, so the form offers nothing to pick from: only "Crear"
  await expect(B.page.getByRole("radio", { name: /Crear «/ })).toBeVisible();
  await expect(B.page.getByRole("radio", { name: "Usar uno de mis hábitos" })).toHaveCount(0);
  await expect(B.page.getByRole("radio", { name: "Lectura previa" })).toHaveCount(0);

  await Promise.all([A.ctx.close(), B.ctx.close()]);
});

test("admins: cannot remove oneself, the last admin cannot leave, name and remove an admin", async ({ browser }) => {
  const [a, b] = await Promise.all([mk("gma", "Ana"), mk("gmb", "Beto")]);
  const A = await session(browser, a);
  const B = await session(browser, b);
  const pa = A.page;
  const groupId = await createGroup(pa, `Equipo ${tag()}`, `Correr ${tag()}`);
  const invite = await inviteLink(pa, groupId);
  await join(B.page, invite);

  await pa.goto(`/grupos/${groupId}`);
  await showSection(pa, "Miembros");
  const members = pa.getByRole("region", { name: "Miembros" });
  // no menu on your own row, so nobody can remove themself
  await expect(pa.getByRole("button", { name: `Opciones de ${a.name}` })).toHaveCount(0);
  await expect(pa.getByRole("button", { name: `Opciones de ${b.name}` })).toBeVisible();

  // the last admin cannot leave while members remain
  await pa.getByRole("button", { name: "Salir del grupo" }).click();
  const leave = pa.getByRole("dialog", { name: "Salir del grupo" });
  await leave.getByRole("button", { name: "Salir del grupo" }).click();
  await expect(leave.getByText("Eres el único administrador. Nombra a otro antes de salir.")).toBeVisible();
  await expect(pa).toHaveURL(new RegExp(`/grupos/${groupId}$`));
  await leave.getByRole("button", { name: "Cerrar" }).click();

  // name B an administrator, then take it back, then remove B
  await pa.getByRole("button", { name: `Opciones de ${b.name}` }).click();
  await pa.getByRole("dialog").getByRole("button", { name: "Hacer administrador" }).click();
  await expect(members.getByText("Administrador", { exact: true })).toHaveCount(2);
  await pa.getByRole("button", { name: `Opciones de ${b.name}` }).click();
  await pa.getByRole("dialog").getByRole("button", { name: "Quitar administrador" }).click();
  await expect(members.getByText("Administrador", { exact: true })).toHaveCount(1);
  await pa.getByRole("button", { name: `Opciones de ${b.name}` }).click();
  await pa.getByRole("dialog").getByRole("button", { name: "Sacar del grupo" }).click();
  await pa.getByRole("dialog").getByRole("button", { name: "Sacar del grupo" }).click();
  await expect(pa.getByRole("button", { name: `Opciones de ${b.name}` })).toHaveCount(0);
  await showSection(pa, "Tablero");
  await expect(board(pa)).toHaveCount(1);

  await Promise.all([A.ctx.close(), B.ctx.close()]);
});

test("an archived group is read-only", async ({ browser }) => {
  const [a, b] = await Promise.all([mk("gha", "Ana"), mk("ghb", "Beto")]);
  const A = await session(browser, a);
  const B = await session(browser, b);
  const name = `Archivo ${tag()}`;
  const groupId = await createGroup(A.page, name, `Caminar ${tag()}`);
  await join(B.page, await inviteLink(A.page, groupId));

  await A.page.goto(`/grupos/${groupId}`);
  await showSection(A.page, "Miembros");
  await A.page.getByRole("button", { name: "Archivar grupo" }).click();
  await A.page.getByRole("dialog", { name: "Archivar grupo" }).getByRole("button", { name: "Archivar grupo" }).click();
  await expect(A.page.getByText("Este grupo está archivado.")).toBeVisible();
  for (const control of ["Invitar", "Editar grupo", "Cambiar compromiso", "Archivar grupo", "Salir del grupo"]) {
    await expect(A.page.getByRole("button", { name: control, exact: true })).toHaveCount(0);
  }

  // a member sees it archived too, in the list under "Archivados", and no chip on Hoy
  await B.page.goto(`/grupos/${groupId}`);
  await expect(B.page.getByText("Este grupo está archivado.")).toBeVisible();
  await B.page.goto("/grupos");
  await expect(B.page.getByText("Archivados", { exact: true })).toBeVisible();
  await B.page.goto("/");
  await expect(B.page.getByRole("img", { name: `Grupo ${name}` })).toHaveCount(0);

  await Promise.all([A.ctx.close(), B.ctx.close()]);
});

test("invitation links: a bad code shows the invalid-link copy; only the exact shape is public", async ({ browser }) => {
  const b = await mk("gib", "Beto");
  const B = await session(browser, b);
  const INVALID = "Este enlace ya no sirve. Pide uno nuevo.";
  const unknown = `/g/${"2".repeat(8)}`;

  // signed in: an unknown code of the right shape, and a code of no shape at all
  await B.page.goto(unknown);
  await expect(B.page.getByText(INVALID)).toBeVisible();
  await B.page.goto("/g/no-es-un-codigo");
  await expect(B.page.getByText(INVALID)).toBeVisible();

  // signed out: the exact shape is public and says the same; everything else under /grupos asks for a session
  const out = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const po = await out.newPage();
  await po.goto(unknown);
  await expect(po).toHaveURL(new RegExp(`${unknown}$`));
  await expect(po.getByText(INVALID)).toBeVisible();
  for (const path of ["/grupos", "/grupos/nuevo", `/grupos/${randomUUID()}`, "/grupos/unirse/K7QM4PXD", `/g/${"0".repeat(8)}`, `/g/${"2".repeat(9)}`, "/g/abc"]) {
    await po.goto(path);
    await expect(po, path).toHaveURL(/\/login/);
  }
  await out.close();
  await B.ctx.close();
});

test("360 px without horizontal overflow on the four pages, light and dark", async ({ browser }) => {
  const [a, b] = await Promise.all([mk("g3a", "Ana"), mk("g3b", "Beto")]);
  const A = await session(browser, a);
  const B = await session(browser, b);
  const groupId = await createGroup(A.page, `Un nombre de grupo bastante largo ${tag()}`, `Un compromiso largo ${tag()}`);
  const invite = await inviteLink(A.page, groupId);
  await join(B.page, invite);

  for (const scheme of ["light", "dark"] as const) {
    for (const { page } of [A, B]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 360, height: 780 });
      for (const path of ["/grupos", "/grupos/nuevo", `/grupos/${groupId}`, invite]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(width, `${scheme} ${path}`).toBeLessThanOrEqual(360);
      }
    }
  }
  await Promise.all([A.ctx.close(), B.ctx.close()]);
});

test("signing up from an invitation link, then joining; no member data in the signed-out page source", async ({ browser }) => {
  const a = await mk("gsa", "Ana");
  const A = await session(browser, a);
  const name = `Registro ${tag()}`;
  const groupId = await createGroup(A.page, name, `Nadar ${tag()}`);
  const invite = await inviteLink(A.page, groupId);

  const out = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const po = await out.newPage();
  // the page source a signed-out visitor receives: the group, never a member (name, @usuario or id)
  const html = await (await out.request.get(invite)).text();
  expect(html).toContain(name);
  for (const secret of [a.handle, a.name, a.id, "Ana"]) expect(html, `source mentions ${secret}`).not.toContain(secret);

  // preview, then sign up (the new account has no group yet), then the same link joins
  await po.goto(invite);
  await expect(po.getByRole("heading", { name: `Te invitaron a ${name}` })).toBeVisible();
  const handle = randomHandle("gsb");
  await signUp(po, handle, "Bruno");
  await po.goto(invite);
  await expect(po.getByRole("heading", { name: `Te invitaron a ${name}` })).toBeVisible();
  await po.getByRole("button", { name: "Unirme" }).click();
  await expect(po).toHaveURL(new RegExp(`/grupos/${groupId}$`));
  await expect(board(po)).toHaveCount(2);
  // a member who opens the link again is told so, with a link to the group and nothing to join
  await po.goto(invite);
  await expect(po.getByText("Ya eres parte de este grupo.")).toBeVisible();
  await expect(po.getByRole("link", { name: "Ver el grupo" })).toHaveAttribute("href", `/grupos/${groupId}`);
  await expect(po.getByRole("button", { name: "Unirme" })).toHaveCount(0);

  await out.close();
  await A.ctx.close();
});

test("leaving shows no 404 on the way out; a wrong code typed by hand shows the link-gone copy", async ({ browser }) => {
  const [a, b] = await Promise.all([mk("gla", "Ana"), mk("glb", "Beto")]);
  const A = await session(browser, a);
  const B = await session(browser, b);
  const groupId = await createGroup(A.page, `Salida ${tag()}`, `Saltar ${tag()}`);
  await join(B.page, await inviteLink(A.page, groupId));

  await B.page.goto(`/grupos/${groupId}`);
  await B.page.evaluate(() => {
    (window as unknown as { __saw404: boolean }).__saw404 = false;
    new MutationObserver(() => {
      if ([...document.querySelectorAll("h1")].some((h) => h.textContent?.trim() === "404")) {
        (window as unknown as { __saw404: boolean }).__saw404 = true;
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await showSection(B.page, "Miembros");
  await B.page.getByRole("button", { name: "Salir del grupo" }).click();
  await B.page.getByRole("dialog", { name: "Salir del grupo" }).getByRole("button", { name: "Salir del grupo" }).click();
  await expect(B.page).toHaveURL(/\/grupos$/);
  expect(await B.page.evaluate(() => (window as unknown as { __saw404: boolean }).__saw404)).toBe(false);

  // a wrong (well-formed) code typed in "Tengo un enlace": the link-gone copy; the limit itself is unit-tested
  await B.page.getByRole("button", { name: "Tengo un enlace" }).click();
  await B.page.getByLabel("Enlace o código de invitación").fill("zzzz-zzzz");
  await B.page.getByRole("button", { name: "Continuar" }).click();
  await expect(B.page).toHaveURL(/\/g\/ZZZZZZZZ$/);
  await expect(B.page.getByText("Este enlace ya no sirve. Pide uno nuevo.")).toBeVisible();

  await Promise.all([A.ctx.close(), B.ctx.close()]);
});
