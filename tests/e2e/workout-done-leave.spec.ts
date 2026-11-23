import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { logIn, PASSWORD, randomHandle } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase (E2E_SUPABASE=1)");
// the owner's phone: 390 px, touch
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

let handle = "";
let userId = "";
let habitId = "";

test.beforeAll(async () => {
  handle = randomHandle("leave");
  const { data, error } = await admin().auth.admin.createUser({
    email: `${handle}@example.com`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      username: handle,
      first_name: "Gabi",
      last_name: "E2E",
      birth_date: "1993-05-05",
      timezone: "America/Santiago",
      terms_accepted: true,
    },
  });
  expect(error).toBeNull();
  userId = data.user!.id;
});

// the celebration opens once per habit and day, so every test checks in a fresh habit
test.beforeEach(async () => {
  const { data, error } = await admin()
    .from("habits")
    .insert({
      user_id: userId,
      name: "Gimnasio",
      icon: "barbell",
      frequency_type: "weekly",
      target_per_week: 5,
      color: "cielo",
      log_type: "workout",
      preset: "gym",
      requires_photo: true,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  habitId = data!.id;
});

/** Logs in, sends a generated photo for the gym habit and waits for the celebration sheet. */
async function openCelebration(page: Page) {
  await page.addInitScript(() => Object.defineProperty(navigator, "mediaDevices", { value: undefined }));
  await logIn(page, `@${handle}`, PASSWORD);
  const jpeg = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#5a5ac2";
    g.fillRect(0, 0, 64, 64);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  await page.goto(`/habitos/${habitId}/foto`);
  await page.locator('input[type="file"]').setInputFiles({
    name: "gym.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(jpeg, "base64"),
  });
  await page.getByRole("button", { name: "Usar esta foto" }).click();
  const sheet = page.getByRole("dialog", { name: "Entrenamiento cumplido" });
  await expect(sheet).toBeVisible();
  return sheet;
}

const isRsc = (url: URL) => url.searchParams.has("_rsc") && url.pathname === "/";

test("Listo closes the sheet at once, however long Hoy takes, and asks the server for Hoy once", async ({ page }) => {
  const sheet = await openCelebration(page);
  const rscForHoy: string[] = [];
  await page.route(isRsc, async (route) => {
    if (!route.request().headers()["next-router-prefetch"]) rscForHoy.push(route.request().url());
    await new Promise((r) => setTimeout(r, 3_000));
    await route.continue();
  });

  await sheet.getByRole("button", { name: "Listo" }).tap();

  // the sheet never waits for the network, and what stays behind is a loading shape, not an empty page
  await expect(sheet).toHaveCount(0, { timeout: 500 });
  await expect(page.locator("[aria-busy='true']")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/$/);
  // replace("/") already renders Hoy fresh (dynamic pages are not cached on the client): no second round trip
  expect(rscForHoy).toHaveLength(1);
  // ...and that render is fresh: the habit is already checked in (no "Foto" shortcut left)
  await expect(page.getByRole("link", { name: "Foto", exact: true })).toHaveCount(0);
});

test("Registrar entrenamiento closes the sheet at once, navigates once and lands on the logger", async ({ page }) => {
  const sheet = await openCelebration(page);
  const logger = new RegExp(`/habitos/${habitId}/entrenamiento$`);
  const navigations: string[] = [];
  await page.route(
    (url) => url.searchParams.has("_rsc") && url.pathname === `/habitos/${habitId}/entrenamiento`,
    async (route) => {
      if (!route.request().headers()["next-router-prefetch"]) navigations.push(route.request().url());
      await new Promise((r) => setTimeout(r, 3_000));
      await route.continue();
    },
  );

  // three quick taps in the same task: only the first one may navigate
  await sheet.getByRole("button", { name: "Registrar entrenamiento" }).evaluate((el: HTMLElement) => {
    el.click();
    el.click();
    el.click();
  });

  await expect(sheet).toHaveCount(0, { timeout: 500 });
  await expect(page.locator("[aria-busy='true']")).toBeVisible();
  await expect(page).toHaveURL(logger, { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Guardar" })).toBeVisible();
  expect(navigations).toHaveLength(1);
});

test("if the logger never answers, the app goes there with a full page load", async ({ page }) => {
  const sheet = await openCelebration(page);
  await page.route(
    (url) => url.searchParams.has("_rsc") && url.pathname === `/habitos/${habitId}/entrenamiento`,
    () => new Promise(() => {}),
  );
  await sheet.getByRole("button", { name: "Registrar entrenamiento" }).tap();
  await expect(sheet).toHaveCount(0, { timeout: 500 });
  await expect(page).toHaveURL(new RegExp(`/habitos/${habitId}/entrenamiento$`), { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Guardar" })).toBeVisible();
});

for (const width of [360, 390, 412]) {
  test(`the counter line stays on one line at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    if (process.env.LAYOUT_SCHEME) await page.emulateMedia({ colorScheme: process.env.LAYOUT_SCHEME as "dark" | "light" });
    const sheet = await openCelebration(page);
    const counter = sheet.locator("p.font-mono");
    await expect(counter).toHaveText("1 de 5 esta semana");
    if (process.env.LAYOUT_SHOTS) await page.screenshot({ path: `${process.env.LAYOUT_SHOTS}-${width}.png` });
    // stacked: the cat (128 px wide) sits centred above the counter
    const cat = (await sheet.locator(".cat-mask").boundingBox())!;
    const line = (await counter.boundingBox())!;
    expect(Math.round(cat.width)).toBe(128);
    expect(cat.y + cat.height).toBeLessThanOrEqual(line.y);
    expect(Math.abs(cat.x + cat.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    const heightOf = () => counter.evaluate((el) => el.getBoundingClientRect().height);
    // one line = the height of a one-character counter
    await counter.evaluate((el) => {
      el.lastChild!.textContent = "1";
    });
    const oneLine = await heightOf();
    for (const text of ["1 de 5 esta semana", "Racha de 12 semanas", "Racha de 120 semanas"]) {
      await counter.evaluate((el, t) => {
        el.lastChild!.textContent = t;
      }, text);
      expect(await heightOf(), text).toBe(oneLine);
    }
  });
}

test("if Hoy never answers, the app goes to Hoy with a full page load", async ({ page }) => {
  const sheet = await openCelebration(page);
  // the client-side navigation hangs (flaky network, odd proxy); a normal document load still works
  await page.route(isRsc, () => new Promise(() => {}));

  await sheet.getByRole("button", { name: "Listo" }).tap();

  await expect(sheet).toHaveCount(0, { timeout: 500 });
  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/$/);
});
