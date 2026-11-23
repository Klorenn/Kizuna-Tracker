import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { createPresetHabit, logIn, PASSWORD, randomHandle } from "./helpers";

test.skip(!process.env.E2E_SUPABASE || !process.env.FINAL_SHOTS, "needs the local stack and FINAL_SHOTS=<dir>");

/** 375 px screenshots in light and dark of the screens that carry the new section labels. */
async function shot(page: Page, name: string) {
  const dir = process.env.FINAL_SHOTS!;
  await page.setViewportSize({ width: 375, height: 812 });
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/${name}-${scheme}.png`, fullPage: true });
  }
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function mk(prefix: string, first: string) {
  const handle = randomHandle(prefix);
  const { data, error } = await admin().auth.admin.createUser({
    email: `${handle}@example.com`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username: handle, first_name: first, last_name: "Forma", birth_date: "1995-05-05", timezone: "America/Santiago", terms_accepted: true },
  });
  expect(error).toBeNull();
  return { id: data.user!.id, handle };
}
async function link(requester: string, addressee: string, status: "accepted" | "pending") {
  const { error } = await admin().from("friendships").insert({ requester_id: requester, addressee_id: addressee, status });
  expect(error).toBeNull();
}

test("final shots", async ({ page }) => {
  test.setTimeout(240_000);
  const [a, b, c, d, e] = await Promise.all([mk("fsa", "Ana"), mk("fsb", "Beto"), mk("fsc", "Carla"), mk("fsd", "Diego"), mk("fse", "Eva")]);
  await link(a.id, b.id, "accepted");
  await link(b.id, c.id, "accepted");
  await link(b.id, d.id, "accepted");
  await link(e.id, a.id, "pending");
  await logIn(page, `@${a.handle}`, PASSWORD);
  await createPresetHabit(page, "Estudiar");
  await page.goto("/");
  await shot(page, "01-hoy");
  await page.goto("/amigos");
  await expect(page.getByRole("region", { name: "Sugerencias" })).toBeVisible();
  await shot(page, "02-amigos");
  await page.goto("/amigos/explorar");
  await shot(page, "03-explorar");

  await page.goto("/resumen");
  await shot(page, "06-resumen");
  await page.goto("/perfil");
  await shot(page, "07-perfil");
  await page.goto("/perfil/ajustes");
  await shot(page, "08-perfil-ajustes");
  const href = await page.goto("/").then(() => page.getByRole("link", { name: /^Medir tiempo de/ }).getAttribute("href"));
  await page.clock.install();
  await page.goto(href!);
  await page.getByRole("radio", { name: "Temporizador" }).click();
  await shot(page, "04-medir-temporizador-idle");
  await page.getByRole("radio", { name: "Cronómetro" }).click();
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await page.clock.runFor(12 * 60_000 + 5_000);
  await shot(page, "05-medir-cronometro-running");

});
