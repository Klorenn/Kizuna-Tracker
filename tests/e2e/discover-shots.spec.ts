import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { logIn, PASSWORD, randomHandle } from "./helpers";

test.skip(!process.env.E2E_SUPABASE || !process.env.D31_SHOTS, "optional screenshots: set D31_SHOTS=<dir> (needs migration 0022)");

const DIR = process.env.D31_SHOTS ?? "";
const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function mk(prefix: string, first: string) {
  const handle = randomHandle(prefix);
  const { data, error } = await admin().auth.admin.createUser({
    email: `${handle}@example.com`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username: handle, first_name: first, last_name: "E2E", birth_date: "1995-05-05", timezone: "America/Santiago", terms_accepted: true },
  });
  expect(error).toBeNull();
  return { id: data.user!.id, handle, name: `${first} E2E` };
}
const link = async (r: string, a: string, status: "accepted" | "pending") =>
  expect((await admin().from("friendships").insert({ requester_id: r, addressee_id: a, status })).error).toBeNull();

async function shot(page: Page, scheme: "light" | "dark", name: string) {
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${DIR}/${name}-${scheme}.png`, fullPage: true });
}

test("screenshots at 375 px, light and dark", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  const [a, b1, b2, c, d, e] = await Promise.all([
    mk("sha", "Ana"), mk("shb", "Beto"), mk("shc", "Bea"), mk("shd", "Carla"), mk("she", "Dani"), mk("shf", "Elena"),
  ]);
  await link(a.id, b1.id, "accepted");
  await link(a.id, b2.id, "accepted");
  await link(b1.id, c.id, "accepted");
  await link(b2.id, c.id, "accepted");
  await link(e.id, a.id, "pending"); // incoming request, so Solicitudes shows
  await page.context().clearCookies();
  await logIn(page, `@${a.handle}`, PASSWORD);

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/amigos");
    const sug = page.getByRole("region", { name: "Sugerencias" });
    await expect(sug.getByText("2 amigos en común")).toBeVisible();
    await expect(sug.getByText("Nuevo en Kizuna").first()).toBeVisible();
    await shot(page, scheme, "01-amigos-sugerencias");

    // after Agregar on a suggestion that is not Carla
    const other = sug.getByRole("listitem").filter({ hasText: "Nuevo en Kizuna" }).first();
    await other.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(other.getByText("Solicitud enviada")).toBeVisible();
    await page.waitForTimeout(800);
    await shot(page, scheme, "02-sugerencia-solicitud-enviada");
    await expect(page.getByRole("region", { name: "Solicitudes" }).getByText("Enviadas")).toBeVisible();
    await shot(page, scheme, "03-solicitudes-enviadas");
    // undo so the second scheme starts from the same state
    await page.getByRole("button", { name: /Cancelar solicitud a/ }).first().click();
    await expect(page.getByRole("button", { name: /Cancelar solicitud a/ })).toHaveCount(0);

    await page.goto("/amigos/explorar");
    await expect(page.getByRole("heading", { name: "Explorar", level: 1 })).toBeVisible();
    await shot(page, scheme, "04-explorar");
    await page.goto("/amigos/explorar?q=carla");
    await expect(page.getByText(c.handle)).toBeVisible();
    await shot(page, scheme, "05-explorar-busqueda");
    await page.goto("/amigos/explorar?q=zzzzqq");
    await expect(page.getByText("Nadie coincide con esa búsqueda.")).toBeVisible();
    await shot(page, scheme, "06-explorar-sin-resultados");
  }

  // Ajustes > Privacidad, switch on then off (own user)
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/perfil/ajustes");
    const sw = page.getByRole("switch", { name: "Aparecer en sugerencias y en Explorar" });
    if ((await sw.getAttribute("aria-checked")) !== "true") await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await sw.scrollIntoViewIfNeeded();
    await shot(page, scheme, "07-ajustes-privacidad-on");
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await expect.poll(async () => (await admin().from("profiles").select("discoverable").eq("id", a.id).single()).data?.discoverable).toBe(false);
    await shot(page, scheme, "08-ajustes-privacidad-off");
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
  }
  void d;
});
