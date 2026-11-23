import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { dayLabel, monthTitle, shiftMonth } from "../../src/domain/calendar";
import { logIn, PASSWORD, randomHandle } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase (E2E_SUPABASE=1)");

const TZ = "America/Santiago";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const prev = shiftMonth(today.slice(0, 7), -1);
const ITEMS_DAY = `${prev}-10`;
const REJECTED_DAY = `${prev}-12`;
const PHOTO_DAY = `${prev}-14`;

type Seed = { handle: string; userId: string; meals: string; gym: string; photoPath: string };

/**
 * Seeds one user with last month's history (service role: test tooling only, the app never writes
 * check-ins from a client): an item habit with 1 of 2 meals, a weekly habit with a rejected photo
 * check-in and a counted photo check-in whose proof is in the private bucket.
 */
async function seed(): Promise<Seed> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const handle = randomHandle("cald");
  const { data: created, error } = await admin.auth.admin.createUser({
    email: `${handle}@example.com`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      username: handle,
      first_name: "Dani",
      last_name: "E2E",
      birth_date: "1994-04-04",
      timezone: TZ,
      terms_accepted: true,
    },
  });
  expect(error).toBeNull();
  const userId = created.user!.id;
  const since = `${prev}-01T15:00:00Z`;

  const { data: meals, error: e1 } = await admin
    .from("habits")
    .insert({ user_id: userId, name: "Comidas", icon: "fork-knife", frequency_type: "daily", color: "salvia", created_at: since })
    .select("id")
    .single();
  expect(e1).toBeNull();
  const { data: items, error: e2 } = await admin
    .from("habit_items")
    .insert([
      { habit_id: meals!.id, user_id: userId, label: "Desayuno", position: 0, created_at: since },
      { habit_id: meals!.id, user_id: userId, label: "Almuerzo", position: 1, created_at: since },
    ])
    .select("id,position");
  expect(e2).toBeNull();
  const first = items!.find((i) => i.position === 0)!;
  const { error: e3 } = await admin
    .from("checkin_items")
    .insert({ item_id: first.id, habit_id: meals!.id, user_id: userId, local_date: ITEMS_DAY });
  expect(e3).toBeNull();

  const { data: gym, error: e4 } = await admin
    .from("habits")
    .insert({
      user_id: userId,
      name: "Gimnasio",
      icon: "barbell",
      frequency_type: "weekly",
      target_per_week: 3,
      color: "cielo",
      created_at: since,
    })
    .select("id")
    .single();
  expect(e4).toBeNull();
  const { error: e5 } = await admin.from("checkins").insert({
    habit_id: gym!.id,
    user_id: userId,
    local_date: REJECTED_DAY,
    rejected_at: new Date().toISOString(),
    rejected_by: userId,
    reject_reason: "unclear",
  });
  expect(e5).toBeNull();

  const checkinId = randomUUID();
  const photoPath = `${userId}/${checkinId}.jpg`;
  const { error: up } = await admin.storage
    .from("proofs")
    .upload(photoPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { contentType: "image/jpeg" });
  expect(up).toBeNull();
  const { error: e6 } = await admin
    .from("checkins")
    .insert({ id: checkinId, habit_id: gym!.id, user_id: userId, local_date: PHOTO_DAY, photo_path: photoPath });
  expect(e6).toBeNull();

  return { handle, userId, meals: meals!.id, gym: gym!.id, photoPath };
}

let data: Seed;
test.beforeAll(async () => {
  data = await seed();
});

const dayButton = (page: Page, date: string) =>
  page.getByRole("grid").getByRole("button", { name: new RegExp(`^${dayLabel(date)}:`) });

test("calendario: progreso de pasos, foto rechazada, foto propia firmada y modal real", async ({ page }) => {
  await logIn(page, `@${data.handle}`, PASSWORD);

  const signCalls: { auth: string | undefined; paths: string[] }[] = [];
  page.on("request", (req) => {
    if (!req.url().includes("/storage/v1/object/sign/proofs")) return;
    const body = (req.postDataJSON() ?? {}) as { paths?: string[] };
    signCalls.push({ auth: req.headers()["authorization"], paths: body.paths ?? [] });
  });

  await page.goto(`/resumen?mes=${prev}`);
  const t = monthTitle(prev);
  await expect(page.getByRole("heading", { name: `${t.name} ${t.year}` })).toBeVisible();

  // a day with only a rejected check-in has its own mark, explained in the legend
  await expect(page.getByText("Borde punteado: foto rechazada, no cuenta.")).toBeVisible();
  await expect(dayButton(page, REJECTED_DAY)).toHaveAccessibleName(/Gimnasio con foto rechazada/);

  // item habit progress in the day sheet
  await dayButton(page, ITEMS_DAY).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("1 de 2");
  await expect(sheet).toContainText("Desayuno");
  await expect(sheet).toContainText("En progreso");

  // real modal: the page behind does not scroll and Tab stays inside
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  // focus is back on the tapped day
  await expect(dayButton(page, ITEMS_DAY)).toBeFocused();

  // rejected badge
  await dayButton(page, REJECTED_DAY).click();
  await expect(sheet.getByText(/Rechazada ·/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // photo thumbnail: signed with the user's own session, only for the user's own paths
  await dayButton(page, PHOTO_DAY).click();
  await expect(sheet.getByRole("figure").first()).toBeVisible();
  await expect.poll(() => signCalls.length).toBeGreaterThan(0);
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  for (const call of signCalls) {
    expect(call.auth).toMatch(/^Bearer /);
    expect(call.auth).not.toBe(`Bearer ${anon}`);
    expect(call.paths.length).toBeGreaterThan(0);
    for (const p of call.paths) expect(p.startsWith(`${data.userId}/`)).toBe(true);
  }
  expect(signCalls.flatMap((c) => c.paths)).toContain(data.photoPath);
  await page.keyboard.press("Escape");
});

test("calendario: ver por meses, calendario del hábito y deslizar", async ({ page }) => {
  await logIn(page, `@${data.handle}`, PASSWORD);
  const t = monthTitle(prev);

  // months view on Resumen keeps the month and goes back to it
  await page.goto(`/resumen?mes=${prev}`);
  await page.getByRole("link", { name: "Ver por meses" }).click();
  await expect(page).toHaveURL(new RegExp(`vista=meses`));
  await expect(page).toHaveURL(new RegExp(`mes=${prev}`));
  await page.getByRole("link", { name: new RegExp(`^${t.name} ${t.year}`) }).click();
  await expect(page).toHaveURL(new RegExp(`mes=${prev}$`));
  await expect(page.getByRole("heading", { name: `${t.name} ${t.year}` })).toBeVisible();

  // habit page: calendar with the weekly note, and its own months view
  await page.goto(`/habitos/${data.gym}?mes=${prev}`);
  await expect(page.getByRole("heading", { name: `${t.name} ${t.year}` })).toBeVisible();
  await expect(page.getByText("Meta: 3 por semana.")).toBeVisible();
  await expect(dayButton(page, PHOTO_DAY)).toHaveAccessibleName(/Gimnasio hecho/);
  await page.getByRole("link", { name: "Ver por meses" }).click();
  await expect(page).toHaveURL(new RegExp(`/habitos/${data.gym}\\?mes=${prev}&vista=meses`));
  await page.getByRole("link", { name: new RegExp(`^${t.name} ${t.year}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/habitos/${data.gym}\\?mes=${prev}$`));

  // swipe left (touch pointer events) goes to the next month
  const grid = page.getByRole("grid");
  await expect(grid).toBeVisible();
  await grid.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const fire = (type: string, x: number) =>
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "touch", pointerId: 7, clientX: x, clientY: y }));
    fire("pointerdown", r.right - 20);
    fire("pointermove", r.right - 80);
    fire("pointermove", r.left + 40);
    fire("pointerup", r.left + 40);
  });
  await expect(page).toHaveURL(new RegExp(`/habitos/${data.gym}$`));
  const now = monthTitle(today.slice(0, 7));
  await expect(page.getByRole("heading", { name: `${now.name} ${now.year}` })).toBeVisible();
});

test("calendario a 360 px: siete columnas visibles, celdas de 44 px y sin scroll horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await logIn(page, `@${data.handle}`, PASSWORD);
  for (const path of [`/resumen?mes=${prev}`, `/habitos/${data.gym}?mes=${prev}`]) {
    await page.goto(path);
    const grid = page.getByRole("grid");
    await expect(grid).toBeVisible();
    const box = await grid.evaluate((el) => {
      const card = el.getBoundingClientRect();
      const heads = [...el.querySelectorAll('[role="columnheader"]')].map((h) => h.getBoundingClientRect());
      const cells = [...el.querySelectorAll('[role="gridcell"] button')].map((b) => b.getBoundingClientRect());
      return {
        gridLeft: card.left,
        gridRight: card.right,
        heads: heads.map((h) => ({ left: h.left, right: h.right })),
        minW: Math.min(...cells.map((c) => c.width)),
        minH: Math.min(...cells.map((c) => c.height)),
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(box.heads).toHaveLength(7);
    for (const h of box.heads) {
      expect(h.left).toBeGreaterThanOrEqual(box.gridLeft - 0.5);
      expect(h.right).toBeLessThanOrEqual(box.gridRight + 0.5);
      expect(h.right).toBeLessThanOrEqual(360);
    }
    expect(box.minW, `${path} cell width`).toBeGreaterThanOrEqual(44);
    expect(box.minH, `${path} cell height`).toBeGreaterThanOrEqual(44);
    expect(box.scrollWidth, `${path} scrollWidth`).toBeLessThanOrEqual(360);
    await expect(page.getByRole("columnheader", { name: "domingo" })).toBeInViewport();
  }
});
