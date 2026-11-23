import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, logIn, PASSWORD, randomHandle } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase (E2E_SUPABASE=1) with migration 0022 applied");

const SWITCH = "Aparecer en sugerencias y en Explorar";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Own users with unique names; `first` may carry an accent. Display name is "<first> E2E". */
async function mk(prefix: string, first: string) {
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

async function link(requester: string, addressee: string, status: "accepted" | "pending") {
  const { error } = await admin().from("friendships").insert({ requester_id: requester, addressee_id: addressee, status });
  expect(error).toBeNull();
}

async function as(page: Page, handle: string) {
  await page.context().clearCookies();
  await logIn(page, `@${handle}`, PASSWORD);
}

const tag = () => Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 6).padEnd(6, "x");
const row = (page: Page, handle: string) => page.getByRole("listitem").filter({ hasText: `@${handle}` });

test("Sugerencias shows a friend of a friend with 1 amigo en común, never a friend or oneself", async ({ page }) => {
  const [a, b, c] = await Promise.all([mk("dsa", "Ana"), mk("dsb", "Beto"), mk("dsc", "Carla")]);
  await link(a.id, b.id, "accepted");
  await link(b.id, c.id, "accepted");
  await as(page, a.handle);
  await page.goto("/amigos");

  const suggestions = page.getByRole("region", { name: "Sugerencias" });
  await expect(suggestions).toBeVisible();
  const carla = suggestions.getByRole("listitem").filter({ hasText: `@${c.handle}` });
  await expect(carla).toContainText("1 amigo en común");
  await expect(suggestions.getByText(`@${b.handle}`)).toHaveCount(0);
  await expect(suggestions.getByText(`@${a.handle}`)).toHaveCount(0);
  expect(await suggestions.getByRole("listitem").count()).toBeLessThanOrEqual(3);
  await expect(suggestions.getByRole("link", { name: "Ver todos" })).toHaveAttribute("href", "/amigos/explorar");
});

test("Explorar finds a name without its accent, sends a request, and Cancelar brings Agregar back", async ({ page }) => {
  const t = tag();
  const [a, d] = await Promise.all([mk("dxa", "Ana"), mk("dxd", `Matías${t}`)]);
  await as(page, a.handle);
  await page.goto("/amigos");
  await page.getByRole("region", { name: "Sugerencias" }).getByRole("link", { name: "Ver todos" }).click();
  await expect(page).toHaveURL(/\/amigos\/explorar$/);
  await expect(page.getByRole("heading", { name: "Explorar", level: 1 })).toBeVisible();

  await page.getByLabel("Buscar por nombre o @usuario").fill(`matias${t}`);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/amigos/explorar\\?q=matias${t}$`));
  const dRow = row(page, d.handle);
  await expect(dRow).toContainText(d.name);
  await dRow.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(dRow.getByText("Solicitud enviada")).toBeVisible();

  await page.goto("/amigos");
  const sent = page.getByRole("region", { name: "Solicitudes" });
  await expect(sent.getByText("Enviadas")).toBeVisible();
  await expect(sent.getByText(`@${d.handle}`)).toBeVisible();
  await sent.getByRole("button", { name: `Cancelar solicitud a ${d.name}` }).click();
  await expect(page.getByRole("region", { name: "Solicitudes" })).toHaveCount(0);

  await page.goto(`/amigos/explorar?q=matias${t}`);
  await expect(row(page, d.handle).getByRole("button", { name: "Agregar", exact: true })).toBeVisible();
});

test("a suggestion row stays in place showing Solicitud enviada after Agregar, and Enviadas gains the person", async ({ page }) => {
  const [a, b, c] = await Promise.all([mk("dea", "Ana"), mk("deb", "Beto"), mk("dec", "Carla")]);
  await link(a.id, b.id, "accepted");
  await link(b.id, c.id, "accepted");
  await as(page, a.handle);
  await page.goto("/amigos");
  const suggestions = page.getByRole("region", { name: "Sugerencias" });
  const rows = suggestions.getByRole("listitem");
  const carla = suggestions.getByRole("listitem").filter({ hasText: `@${c.handle}` });
  await expect(carla).toBeVisible();
  const before = await rows.allTextContents();
  await carla.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(carla.getByText("Solicitud enviada")).toBeVisible();
  await expect(page.getByRole("region", { name: "Solicitudes" }).getByText(`@${c.handle}`)).toBeVisible();
  const after = await rows.allTextContents();
  expect(after.length).toBe(before.length);
  expect(after.map((t) => t.replace("Solicitud enviada", "")).map((t) => t.includes(`@${c.handle}`))).toEqual(
    before.map((t) => t.includes(`@${c.handle}`)),
  );
});

test("one character runs nothing; no match and a non-match have their own messages", async ({ page }) => {
  const a = await mk("dqa", "Ana");
  await as(page, a.handle);
  await page.goto("/amigos/explorar?q=a");
  await expect(page.getByText("Escribe al menos 2 letras.")).toBeVisible();
  await page.goto(`/amigos/explorar?q=zzzz${tag()}qq`);
  await expect(page.getByText("Nadie coincide con esa búsqueda.")).toBeVisible();
});

test("the old /amigos?q= link lands in Explorar", async ({ page }) => {
  const [a, b] = await Promise.all([mk("dla", "Ana"), mk("dlb", "Beto")]);
  await as(page, a.handle);
  await page.goto(`/amigos?q=${b.handle}`);
  await expect(page).toHaveURL(new RegExp(`/amigos/explorar\\?q=${b.handle}$`));
  await expect(row(page, b.handle)).toBeVisible();
});

test("turning the switch off removes a person from suggestions, the list and name search, but not from an exact @usuario", async ({
  page,
}) => {
  const t = tag();
  const [a, b, c] = await Promise.all([mk("dza", "Ana"), mk("dzb", "Beto"), mk("dzc", `Valentín${t}`)]);
  await link(a.id, b.id, "accepted");
  await link(b.id, c.id, "accepted");

  await as(page, a.handle);
  await page.goto("/amigos");
  await expect(page.getByRole("region", { name: "Sugerencias" }).getByText(`@${c.handle}`)).toBeVisible();

  await as(page, c.handle);
  await page.goto("/perfil/ajustes");
  const toggle = page.getByRole("switch", { name: SWITCH });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect
    .poll(async () => (await admin().from("profiles").select("discoverable").eq("id", c.id).single()).data?.discoverable)
    .toBe(false);
  await page.reload();
  await expect(page.getByRole("switch", { name: SWITCH })).toHaveAttribute("aria-checked", "false");

  await as(page, a.handle);
  await page.goto("/amigos");
  await expect(page.getByRole("region", { name: "Sugerencias" }).getByText(`@${c.handle}`)).toHaveCount(0);
  await page.goto("/amigos/explorar");
  await expect(page.getByText(`@${c.handle}`)).toHaveCount(0);
  await page.goto(`/amigos/explorar?q=valentin${t}`);
  await expect(page.getByText("Nadie coincide con esa búsqueda.")).toBeVisible();
  await page.goto(`/amigos/explorar?q=${c.handle}`);
  await expect(row(page, c.handle)).toContainText(c.name);
});

test("the person who received a request sees accept and reject on the requester's row in Explorar", async ({ page }) => {
  const [x, y] = await Promise.all([mk("drx", "Xavi"), mk("dry", "Yara")]);
  await link(x.id, y.id, "pending");
  await as(page, y.handle);
  await page.goto(`/amigos/explorar?q=${x.handle}`);
  const xRow = row(page, x.handle);
  await expect(xRow.getByRole("button", { name: `Aceptar a ${x.name}` })).toBeVisible();
  await expect(xRow.getByRole("button", { name: `Rechazar a ${x.name}` })).toBeVisible();
  await xRow.getByRole("button", { name: `Aceptar a ${x.name}` }).click();
  await expect(xRow.getByText("Ya son amigos")).toBeVisible();
});

test("Ver más appends the next page and keeps the rows already shown", async ({ page }) => {
  const t = tag();
  const a = await mk("dpa", "Ana");
  await Promise.all(Array.from({ length: 22 }, (_, i) => mk(`dp${i}`, `Lote${t}${String.fromCharCode(97 + i)}`)));
  await as(page, a.handle);
  await page.goto(`/amigos/explorar?q=lote${t}`);
  const items = page.getByRole("main").getByRole("listitem");
  await expect(items).toHaveCount(20);
  // act on a visible row, then load more: its state must survive
  const firstRow = items.first();
  await firstRow.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(firstRow.getByText("Solicitud enviada")).toBeVisible();
  await page.getByRole("button", { name: "Ver más" }).click();
  await expect(items).toHaveCount(22);
  await expect(items.first().getByText("Solicitud enviada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver más" })).toHaveCount(0);
});

test("375 px: Amigos and Explorar do not scroll sideways, light and dark", async ({ page }) => {
  const [a, b, c] = await Promise.all([mk("dwa", "Ana"), mk("dwb", "Beto"), mk("dwc", "Carla Con Un Nombre Muy Largo")]);
  await link(a.id, b.id, "accepted");
  await link(b.id, c.id, "accepted");
  await link(a.id, (await mk("dwd", "Dana")).id, "pending");
  await as(page, a.handle);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expectNoHorizontalScroll(page, ["/amigos", "/amigos/explorar", "/amigos/explorar?q=ana", "/perfil/ajustes"]);
  }
});
