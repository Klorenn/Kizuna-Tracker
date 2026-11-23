import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { logIn, PASSWORD, randomHandle, expectNotFound } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase (E2E_SUPABASE=1)");

// This spec does not depend on the day the shared database was seeded: it makes its own user
// and writes "today" through the app's own RPCs and RLS-checked inserts (never the service role
// for the logs): 85 min of Álgebra with 2 pomodoros, five sums of water (5 de 8 vasos, no
// check-in), Dark episode 5, a 5,2 km run in 29:40 (5:42 /km) and a book at page 40 of 412.
const TZ = "America/Santiago";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Ids = { publico: string; estudiar: string; series: string; agua: string; trotar: string; leer: string };
let handle = "";
let ids: Ids;

const must = <T,>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => {
  if (r.error || r.data === null) throw new Error(`${what}: ${r.error?.message ?? "no data"}`);
  return r.data as NonNullable<T>;
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  handle = randomHandle("v4");
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const created = await admin.auth.admin.createUser({
    email: `${handle}@example.com`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username: handle, first_name: "Vera", last_name: "E2E", birth_date: "1992-04-04", timezone: TZ, terms_accepted: true },
  });
  const userId = must({ data: created.data?.user?.id ?? null, error: created.error }, "createUser");

  const db: SupabaseClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  must({ data: (await db.auth.signInWithPassword({ email: `${handle}@example.com`, password: PASSWORD })).data.session, error: null }, "signIn");

  const habit = async (row: Record<string, unknown>) =>
    must(
      await db
        .from("habits")
        .insert({ user_id: userId, frequency_type: "daily", visibility: "private", color: "cielo", ...row })
        .select("id")
        .single(),
      `habit ${row.name}`,
    ).id as string;
  ids = {
    leer: await habit({ name: "Leer", icon: "book", log_type: "reading" }),
    // a public habit, so that the public profile exists (and must still show nothing of the rest)
    publico: await habit({ name: "Meditar", icon: "moon", visibility: "public" }),
    estudiar: await habit({ name: "Estudiar", icon: "book-open", frequency_type: "weekly", target_per_week: 5, log_type: "time" }),
    series: await habit({ name: "Series y películas", icon: "television", frequency_type: "weekly", target_per_week: 3, log_type: "watch" }),
    agua: await habit({
      name: "Agua", icon: "drop", log_type: "quantity",
      quantity_unit: "ml", quantity_target: 2000, quantity_step: 250, quantity_display: "glasses", glass_ml: 250,
    }),
    trotar: await habit({ name: "Trotar", icon: "sneaker-move", frequency_type: "weekly", target_per_week: 3, log_type: "cardio" }),
  };

  const rpc = async (fn: string, args: Record<string, unknown>) => must(await db.rpc(fn, args), fn);
  // time: 35 manual minutes + two focus blocks of 25 = 85 min, 2 pomodoros
  await rpc("add_time", { p_habit_id: ids.estudiar, p_minutes: 35, p_topic: "Álgebra" });
  for (let i = 0; i < 2; i++) await rpc("add_pomodoro_block", { p_habit_id: ids.estudiar, p_block_id: randomUUID(), p_minutes: 25 });
  // water: five sums of a glass, the goal (8) not reached: no check-in
  for (let i = 0; i < 5; i++) await rpc("add_quantity_entry", { p_habit_id: ids.agua, p_entry_id: randomUUID(), p_amount: 250 });
  // series: Dark, episode 5 today
  const dark = must(
    await db.from("media_items").insert({ user_id: userId, title: "Dark", kind: "series", total_seasons: 3, total_episodes: 26 }).select("id").single(),
    "media",
  ).id as string;
  const watchCheckin = (await rpc("create_checkin", { p_habit_id: ids.series }) as { checkin_id: string }[])[0].checkin_id;
  await rpc("save_watch_entry", {
    p_checkin_id: watchCheckin, p_media_id: dark, p_episodes: 1, p_season: 1, p_episode_to: 5, p_minutes: null, p_completed: false,
  });
  // distance: a run of 5,2 km in 29:40
  const runCheckin = (await rpc("create_checkin", { p_habit_id: ids.trotar }) as { checkin_id: string }[])[0].checkin_id;
  await rpc("add_cardio_entry", { p_checkin_id: runCheckin, p_kind: "run", p_distance_m: 5200, p_duration_s: 1780 });
  // reading: Dune, page 40 of 412
  const dune = must(
    await db.from("books").insert({ user_id: userId, title: "Dune", total_pages: 412 }).select("id").single(),
    "book",
  ).id as string;
  const readCheckin = (await rpc("create_checkin", { p_habit_id: ids.leer }) as { checkin_id: string }[])[0].checkin_id;
  await rpc("save_reading_entry", { p_checkin_id: readCheckin, p_book_id: dune, p_from_page: 14, p_to_page: 40 });
});

async function noHorizontalScroll(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(375);
}

test("Resumen shows the v4 cards and each opens its drill-down", async ({ page }) => {
  await logIn(page, `@${handle}`, PASSWORD);
  await page.goto("/resumen");

  const card = (name: RegExp) => page.getByRole("link", { name });
  await expect(card(/^Tiempo \d/)).toBeVisible();
  await expect(card(/^Películas \d/)).toBeVisible();
  await expect(card(/^Episodios 1\./)).toBeVisible();
  await expect(card(/^Agua .*vasos\/día/)).toBeVisible();
  await expect(card(/^Trote 5,2 km/)).toBeVisible();
  await expect(card(/^Agua /)).toHaveAttribute("href", new RegExp(`^/resumen/cantidad/${ids.agua}\\?mes=\\d{4}-\\d{2}$`));

  await card(/^Tiempo \d/).click();
  await expect(page).toHaveURL(/\/resumen\/tiempo\?mes=/);
  await expect(page.getByRole("heading", { name: "Tiempo", level: 1 })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Tiempo por mes:/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Tiempo por semana de /i })).toBeVisible();
  await expect(page.getByText("Álgebra").first()).toBeVisible();

  await page.goto("/resumen");
  await card(/^Trote 5,2 km/).click();
  await expect(page).toHaveURL(/\/resumen\/distancia\?mes=/);
  await expect(page.getByText("Mejor ritmo")).toBeVisible();
  await expect(page.getByRole("img", { name: /^Ritmo por salida:/ })).toBeVisible();
  await expect(page.getByText("5,2 km · 29:40 · 5:42 /km")).toBeVisible();

  await page.goto("/resumen");
  await card(/^Películas \d/).click();
  await expect(page).toHaveURL(/\/resumen\/series\?mes=/);
  await expect(page.getByRole("img", { name: /^Episodios por mes:/ })).toBeVisible();
  await expect(page.getByText("Dark · 1 episodio · T1 E5")).toBeVisible();

  await page.goto("/resumen");
  await card(/^Agua /).click();
  await expect(page).toHaveURL(new RegExp(`/resumen/cantidad/${ids.agua}`));
  await expect(page.getByRole("heading", { name: "Agua", level: 1 })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Promedio por día y por mes, en vasos:/ })).toBeVisible();

  // not a quantity habit of this user -> 404
  await expectNotFound(page, `/resumen/cantidad/${ids.estudiar}`);
});

test("the calendar day sheet shows time, distance and water with their sums", async ({ page }) => {
  await logIn(page, `@${handle}`, PASSWORD);
  await page.goto("/resumen");

  const todayCell = page.locator('[role="grid"] [aria-current="date"]');
  // a day with sums under the goal keeps the "in progress" shape and says so in its name
  await expect(todayCell).toHaveAttribute("aria-label", /Agua 5 de 8 vasos/);
  await todayCell.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("1 h 25 min · Álgebra · 2 pomodoros")).toBeVisible();
  await expect(sheet.getByText("Trote · 5,2 km · 29:40 · 5:42 /km")).toBeVisible();
  await expect(sheet.getByText("5 de 8 vasos")).toBeVisible();
  const sums = sheet.getByRole("list", { name: "Sumas del día" }).getByRole("listitem");
  await expect(sums).toHaveCount(5);
  await expect(sums.first()).toContainText(/\d{1,2}:\d{2}/);
  await expect(sums.first()).toContainText("1 vaso");
  await expect(sheet.getByText("Dark · 1 episodio · T1 E5")).toBeVisible();
  await expect(sheet.getByText("página 40 de 412 · 10 %")).toBeVisible();
  // the entry screens belong to other areas: only the links are checked
  await expect(sheet.getByRole("link", { name: "Editar" }).first()).toHaveAttribute(
    "href",
    new RegExp(`/habitos/[0-9a-f-]+/(lectura|tiempo|visto|distancia)\\?fecha=\\d{4}-\\d{2}-\\d{2}$`),
  );
  await expect(sheet.getByRole("link", { name: "Editar en Hoy" })).toHaveAttribute("href", "/");
});

test("habit detail PROGRESO for each kind, and the book in one format", async ({ page }) => {
  await logIn(page, `@${handle}`, PASSWORD);

  await page.goto(`/habitos/${ids.estudiar}`);
  await expect(page.getByText("Progreso", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Iniciar pomodoro" })).toHaveAttribute("href", `/habitos/${ids.estudiar}/pomodoro`);
  await expect(page.getByText("Pomodoros este mes")).toBeVisible();

  await page.goto(`/habitos/${ids.series}`);
  await expect(page.getByText(/Dark · 1 de 26 episodios/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Series y películas" })).toHaveAttribute("href", "/series");

  await page.goto(`/habitos/${ids.agua}`);
  await expect(page.getByText("Días cumplidos").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver por mes", exact: true })).toHaveAttribute("href", `/resumen/cantidad/${ids.agua}`);

  await page.goto(`/habitos/${ids.trotar}`);
  await expect(page.getByText("Mejor ritmo")).toBeVisible();
  await expect(page.getByText(/Última salida/)).toBeVisible();

  await page.goto(`/habitos/${ids.leer}`);
  await expect(page.getByText("página 40 de 412 · 10 %").first()).toBeVisible();
});

test("a habit id of someone else on the quantity drill-down is the same 404 as a random id", async ({ browser }) => {
  test.setTimeout(90_000);
  // someone else's quantity habit, created through that user's own session
  const otherHandle = randomHandle("v4otro");
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const created = await admin.auth.admin.createUser({
    email: `${otherHandle}@example.com`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username: otherHandle, first_name: "Omar", last_name: "E2E", birth_date: "1992-04-04", timezone: TZ, terms_accepted: true },
  });
  const otherId = must({ data: created.data?.user?.id ?? null, error: created.error }, "createUser other");
  const theirs: SupabaseClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  must({ data: (await theirs.auth.signInWithPassword({ email: `${otherHandle}@example.com`, password: PASSWORD })).data.session, error: null }, "signIn other");
  const foreign = must(
    await theirs
      .from("habits")
      .insert({
        user_id: otherId, name: "Agua", icon: "drop", frequency_type: "daily", visibility: "private", color: "cielo", log_type: "quantity",
        quantity_unit: "ml", quantity_target: 2000, quantity_step: 250, quantity_display: "glasses", glass_ml: 250,
      })
      .select("id")
      .single(),
    "foreign habit",
  ).id as string;

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await logIn(page, `@${handle}`, PASSWORD);
  const bodyOf = async (path: string) => {
    await expectNotFound(page, path);
    return page.locator("body").innerText();
  };
  const randomText = await bodyOf(`/resumen/cantidad/${randomUUID()}`);
  expect(await bodyOf(`/resumen/cantidad/${foreign}`)).toBe(randomText);
  await ctx.close();
});

test("none of it is visible to anyone else", async ({ browser }) => {
  const leaks = ["Álgebra", "Dark", "vasos", "km"];
  const profileText = async (viewer: string | null) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // another signed-in viewer is the seeded Beto, a friend of nobody here
    if (viewer) await logIn(page, viewer, "kizuna-test-1");
    await page.goto(`/@${handle}`);
    await expect(page.getByRole("heading", { name: "Vera E2E", level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const text = await page.locator("main").innerText();
    await ctx.close();
    return text;
  };
  for (const viewer of [null, "@user_b"]) {
    const text = await profileText(viewer);
    for (const leak of leaks) expect(text).not.toContain(leak);
  }
});

test("every new view fits 375 px", async ({ page }) => {
  await logIn(page, `@${handle}`, PASSWORD);
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of [
    "/resumen",
    "/resumen/tiempo",
    "/resumen/tiempo?rango=12",
    "/resumen/series",
    `/resumen/cantidad/${ids.agua}`,
    "/resumen/distancia",
    `/habitos/${ids.estudiar}`,
    `/habitos/${ids.series}`,
    `/habitos/${ids.agua}`,
    `/habitos/${ids.trotar}`,
  ]) {
    await noHorizontalScroll(page, path);
  }
});
