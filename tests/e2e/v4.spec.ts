import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { logIn, PASSWORD, randomHandle } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase (E2E_SUPABASE=1)");

/*
 * v4 logs on Hoy (Task 28): one journey per new kind at 375 px, the habit form, the rule errors,
 * privacy and account deletion. Every test creates its own users and its own data for "today";
 * the service role is test tooling only (users, friendships, the final deletion check).
 */

const TZ = "America/Santiago";
const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = () =>
  createClient(url(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type User = { id: string; handle: string; email: string };

async function makeUser(prefix: string, first = "Lu"): Promise<User> {
  const handle = randomHandle(prefix);
  const email = `${handle}@example.com`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username: handle, first_name: first, last_name: "E2E", birth_date: "1992-04-04", timezone: TZ, terms_accepted: true },
  });
  expect(error).toBeNull();
  return { id: data.user!.id, handle, email };
}

/** The user's own session, to write through the RPCs like the app does. */
async function sessionOf(u: User): Promise<SupabaseClient> {
  const db = createClient(url(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await db.auth.signInWithPassword({ email: u.email, password: PASSWORD });
  expect(error).toBeNull();
  return db;
}

async function addHabit(u: User, name: string, icon: string, logType: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await admin()
    .from("habits")
    .insert({ user_id: u.id, name, icon, frequency_type: "daily", color: "cielo", log_type: logType, ...extra })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

const WATER = { quantity_unit: "ml", quantity_target: 2000, quantity_step: 250, quantity_display: "glasses", glass_ml: 250 };

/** A "Listo" celebration sheet may open when a check-in completes the day: close it if it did. */
async function clearCelebration(page: Page) {
  const ok = page.getByRole("button", { name: "Listo", exact: true });
  try {
    await ok.click({ timeout: 1500 });
  } catch {
    // none opened (or it closed by itself)
  }
}

const row = (page: Page, name: string) => page.getByRole("checkbox", { name, exact: true });
const noScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

test.use({ viewport: { width: 375, height: 812 } });

test("quantity: Agua from the preset, quick add to the goal, undo, double tap, and the goal in a challenge", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const a = await makeUser("agua", "Ana");
  const b = await makeUser("beto", "Beto");
  const { error: fe } = await admin().from("friendships").insert({ requester_id: a.id, addressee_id: b.id, status: "accepted" });
  expect(fe).toBeNull();
  await logIn(page, a.email, PASSWORD);

  // the preset brings the quantity habit: 8 glasses a day, one tap adds one
  await page.goto("/habitos/nuevo");
  await page.getByRole("button", { name: "Agua", exact: true }).click();
  await page.getByRole("button", { name: "Crear hábito" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("0 de 8 vasos")).toBeVisible();
  await expect(page.getByText("0 de 1 hechos")).toBeVisible();
  const add = page.getByRole("button", { name: "Sumar 1 vaso" });
  await expect(add).toBeVisible();
  await noScroll(page);

  // a very fast double tap is two sums (not one, not three). Two back-to-back clicks: Playwright's
  // dblclick fires both in the same instant, which no finger does (see the task report)
  await add.click();
  await add.click();
  await expect(page.getByText("2 de 8 vasos")).toBeVisible();
  await page.reload();
  await expect(page.getByText("2 de 8 vasos")).toBeVisible();

  // up to 7: in progress, never done by the total alone
  for (let i = 0; i < 5; i++) await add.click();
  await expect(page.getByText("7 de 8 vasos")).toBeVisible();
  await expect(page.getByText("Meta de hoy cumplida")).toHaveCount(0);
  await expect(page.getByText("0 de 1 hechos")).toBeVisible();

  // the 8th: the goal is met only after the server says so, and the day counter goes up
  await add.click();
  await expect(page.getByText("8 de 8 vasos")).toBeVisible();
  await expect(page.getByText("Meta de hoy cumplida")).toBeVisible();
  await clearCelebration(page);
  await expect(page.getByText("1 de 1 hechos")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Meta de hoy cumplida")).toBeVisible();

  // a quantity habit has no "deshacer": the sheet removes sums, and below the goal it is pending again
  await page.getByRole("button", { name: "Más opciones de cantidad" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Deshacer la última" }).click();
  await expect(sheet.getByText("7 de 8 vasos")).toBeVisible();
  await sheet.getByRole("button", { name: "Cerrar" }).click();
  await expect(page.getByText("Meta de hoy cumplida")).toHaveCount(0);
  await expect(page.getByText("7 de 8 vasos")).toBeVisible();
  await expect(page.getByText("0 de 1 hechos")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Agua" })).toHaveCount(0);

  // a challenge on Agua: the goal can go up, not down, and the unit stays
  await page.getByRole("link", { name: /^Agua/ }).first().click();
  await page.getByRole("link", { name: "Retar a un amigo" }).click();
  await page.getByLabel("Amigo", { exact: true }).selectOption({ label: `Beto E2E · @${b.handle}` });
  await page.getByLabel("Multa por falla (CLP)").fill("2500");
  await page.getByRole("button", { name: "Enviar reto a Beto" }).click();
  await expect(page).toHaveURL(/\/retos$/);

  const habitId = (await admin().from("habits").select("id").eq("user_id", a.id).single()).data!.id as string;
  await page.goto(`/habitos/${habitId}/editar`);
  const goal = page.getByLabel(/^Meta diaria/);
  await expect(goal).toHaveValue("8");
  await goal.fill("6");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  const lock = "Este hábito está en un reto: puedes subir la meta, no bajarla ni cambiar la unidad.";
  await expect(page.getByText(lock).first()).toBeVisible();
  await expect(page).toHaveURL(/\/editar$/);
  await goal.fill("10");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page).toHaveURL(new RegExp(`/habitos/${habitId}$`));
  const { data: saved } = await admin().from("habits").select("quantity_target").eq("id", habitId).single();
  expect(Number(saved!.quantity_target)).toBe(2500);
});

test("time: Estudiar asks how long, then adds more; the Pomodoro screen leaves its strip on Hoy", async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const u = await makeUser("estud");
  await addHabit(u, "Estudiar", "book-open", "time", { preset: "study" });
  await addHabit(u, "Meditar", "flame", "none");
  await logIn(page, u.email, PASSWORD);

  // "Hecho" opens the sheet: 1 h 25 min of Álgebra
  await row(page, "Estudiar").click();
  const sheet = page.getByRole("dialog", { name: "¿Cuánto rato?" });
  await sheet.getByLabel("Horas").fill("1");
  await sheet.getByLabel("Minutos").fill("25");
  await sheet.getByLabel("Qué estudiaste (opcional)").fill("Álgebra");
  await sheet.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("1 h 25 min · Álgebra")).toBeVisible();
  await expect(row(page, "Estudiar")).toHaveAttribute("aria-checked", "true");
  await noScroll(page);

  // "+ Tiempo" adds to the day
  await page.getByRole("button", { name: "+ Tiempo" }).click();
  await page.getByRole("dialog", { name: "Sumar tiempo" }).getByRole("button", { name: "30 min" }).click();
  await page.getByRole("dialog", { name: "Sumar tiempo" }).getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("1 h 55 min · Álgebra")).toBeVisible();

  // undoing the check-in names what goes with it
  await row(page, "Estudiar").click();
  await expect(page.getByRole("dialog", { name: "¿Deshacer el hábito de hoy?" })).toContainText(
    "Se borrará también el tiempo de hoy (1 h 55 min).",
  );
  await page.getByRole("button", { name: "Cancelar" }).click();

  // another habit, not done yet: Pomodoro button -> screen -> back with the strip
  const v = await makeUser("estub");
  await addHabit(v, "Estudiar", "book-open", "time", { preset: "study" });
  await page.context().clearCookies();
  await logIn(page, v.email, PASSWORD);
  await page.getByRole("link", { name: "Pomodoro", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pomodoro · Estudiar" })).toBeVisible();
  await page.getByRole("button", { name: "Empezar foco" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.goto("/");
  await expect(page.getByText(/Pomodoro en curso/)).toBeVisible();
  await noScroll(page);
});

test("time: a Pomodoro block is credited once and shows on Hoy", async ({ page }) => {
  test.setTimeout(180_000);
  const u = await makeUser("pomo");
  await addHabit(u, "Estudiar", "book-open", "time", { preset: "study" });
  await logIn(page, u.email, PASSWORD);
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("link", { name: "Pomodoro", exact: true }).click();
  await page.getByRole("button", { name: "Personalizado" }).click();
  await page.getByLabel("Foco (min)").fill("5");
  await page.getByText("Sin límite", { exact: true }).click();
  await page.getByRole("button", { name: "Empezar foco" }).click();
  await page.clock.runFor(5 * 60_000);
  await expect(page.getByText("Sumamos 5 min a Estudiar.")).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("5 min").first()).toBeVisible();
  await expect(row(page, "Estudiar")).toHaveAttribute("aria-checked", "true");
  await page.reload();
  // credited once: reloading Hoy (it retries pending blocks) never adds the block again
  await expect(page.getByText("5 min").first()).toBeVisible();
  const { data } = await admin().from("time_entries").select("minutes,pomodoros").eq("user_id", u.id);
  expect(data).toEqual([{ minutes: 5, pomodoros: 1 }]);
});

test("watch: a series with episodes, a movie, and undo asks first", async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const u = await makeUser("vista");
  await addHabit(u, "Series y películas", "television", "watch", { preset: "watch" });
  await addHabit(u, "Meditar", "flame", "none");
  await logIn(page, u.email, PASSWORD);

  await row(page, "Series y películas").click();
  const sheet = page.getByRole("dialog", { name: "¿Qué viste hoy?" });
  // with no titles yet the new-title form starts open
  await expect(sheet.getByLabel("Título", { exact: true })).toBeVisible();
  await sheet.getByLabel("Título", { exact: true }).fill("Dark");
  await sheet.getByRole("button", { name: "Agregar título" }).click();
  await sheet.getByRole("button", { name: "Un episodio más" }).click();
  await sheet.getByRole("button", { name: "Un episodio más" }).click();
  await sheet.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("3 episodios · Dark")).toBeVisible();
  await noScroll(page);

  // undo: the confirmation says what goes with it
  await row(page, "Series y películas").click();
  await expect(page.getByRole("dialog", { name: "¿Deshacer el hábito de hoy?" })).toContainText(
    "Se borrará también lo que viste hoy.",
  );
  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect(row(page, "Series y películas")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("3 episodios · Dark")).toHaveCount(0);

  // a movie, from the same sheet
  await row(page, "Series y películas").click();
  const again = page.getByRole("dialog", { name: "¿Qué viste hoy?" });
  await again.getByRole("button", { name: "Nuevo título" }).click();
  await again.getByLabel("Título", { exact: true }).fill("Alien");
  await again.getByRole("radio", { name: "Película" }).click();
  await again.getByRole("button", { name: "Agregar título" }).click();
  await again.getByText("La vi completa").click();
  await again.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Completa · Alien")).toBeVisible();
});

test("cardio: a run with live pace, then another outing", async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const u = await makeUser("trote");
  await addHabit(u, "Trotar", "sneaker-move", "cardio", { preset: "run" });
  await addHabit(u, "Meditar", "flame", "none");
  await logIn(page, u.email, PASSWORD);

  await row(page, "Trotar").click();
  const sheet = page.getByRole("dialog", { name: "¿Cuánto trotaste hoy?" });
  await sheet.getByLabel("Distancia").fill("5,2");
  await sheet.getByLabel("Horas").fill("0");
  await sheet.getByLabel("Minutos").fill("29");
  await sheet.getByLabel("Segundos").fill("40");
  await expect(sheet.getByText("5:42 /km · 10,5 km/h")).toBeVisible();
  await sheet.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("5,2 km · 29:40 · 5:42 /km")).toBeVisible();
  await noScroll(page);

  await page.getByRole("button", { name: "+ Salida" }).click();
  const more = page.getByRole("dialog");
  await more.getByRole("button", { name: "Caminata" }).click();
  await more.getByLabel("Distancia").fill("2,5");
  await more.getByLabel("Horas").fill("0");
  await more.getByLabel("Minutos").fill("30");
  await more.getByLabel("Segundos").fill("0");
  await more.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("7,7 km · 59:40 · 2 salidas")).toBeVisible();

  // undo asks, naming the two outings
  await row(page, "Trotar").click();
  await expect(page.getByRole("dialog", { name: "¿Deshacer el hábito de hoy?" })).toContainText(
    "Se borrarán también las 2 salidas de hoy.",
  );
});

test("form: every log type can be created and edited, and the rules explain themselves", async ({ page }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const u = await makeUser("forma");
  await logIn(page, u.email, PASSWORD);

  await page.goto("/habitos/nuevo");
  const group = page.getByRole("radiogroup", { name: "Registro detallado" });
  await expect(group.getByRole("radio")).toHaveText(
    ["Ninguno", "Lectura", "Entrenamiento", "Tiempo", "Series y películas", "Cantidad", "Distancia"],
  );
  await noScroll(page);

  // the rules, before saving: steps allow no log; a photo allows no time or quantity
  await page.getByLabel("Nombre").fill("Con pasos");
  await page.getByRole("button", { name: "Agregar paso" }).click();
  await page.getByLabel("Paso 1", { exact: true }).fill("Uno");
  await expect(group.getByRole("radio", { name: "Cantidad" })).toBeDisabled();
  await expect(page.getByText("Un hábito con pasos no lleva registro detallado.")).toBeVisible();
  await page.getByRole("button", { name: "Quitar Uno" }).click();
  await page.getByRole("switch", { name: "Requiere foto" }).click();
  await expect(group.getByRole("radio", { name: "Cantidad" })).toBeDisabled();
  await expect(group.getByRole("radio", { name: "Tiempo" })).toBeDisabled();
  await group.getByRole("radio", { name: "Distancia" }).click();
  await group.getByRole("radio", { name: "Distancia" }).press("ArrowLeft");
  // arrows skip the disabled options: Distancia -> Series y películas
  await expect(group.getByRole("radio", { name: "Series y películas" })).toHaveAttribute("aria-checked", "true");

  // quantity with a photo is refused with its copy
  await page.reload();
  await page.getByLabel("Nombre").fill("Pasos al día");
  await group.getByRole("radio", { name: "Cantidad" }).click();
  await page.getByRole("button", { name: "Pasos", exact: true }).click();
  await page.getByRole("switch", { name: "Requiere foto" }).click();
  await page.getByRole("button", { name: "Crear hábito" }).click();
  await expect(page.getByText("Un hábito con foto no lleva tiempo ni cantidad.", { exact: true })).toBeVisible();
  await page.getByRole("switch", { name: "Requiere foto" }).click();
  await page.getByRole("button", { name: "Crear hábito" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("0 de 8.000 pasos")).toBeVisible();

  // one habit per remaining kind, from "Otro"
  for (const [name, type] of [
    ["Guitarra", "Tiempo"],
    ["Documentales", "Series y películas"],
    ["Bici", "Distancia"],
  ] as const) {
    await page.goto("/habitos/nuevo");
    await page.getByLabel("Nombre").fill(name);
    await page.getByRole("radiogroup", { name: "Registro detallado" }).getByRole("radio", { name: type }).click();
    await page.getByRole("button", { name: "Crear hábito" }).click();
    await expect(page).toHaveURL(/\/$/);
  }
  const logs = await admin().from("habits").select("name,log_type,quantity_unit,quantity_target").eq("user_id", u.id).order("created_at");
  expect(logs.data!.map((h) => [h.name, h.log_type])).toEqual([
    ["Pasos al día", "quantity"],
    ["Guitarra", "time"],
    ["Documentales", "watch"],
    ["Bici", "cardio"],
  ]);
  expect(logs.data![0]).toMatchObject({ quantity_unit: "steps" });
  expect(logs.data![1].quantity_unit).toBeNull();

  // edit: Guitarra becomes a distance habit (and loses nothing else); the form shows its current type
  const guitarra = (await admin().from("habits").select("id").eq("user_id", u.id).eq("name", "Guitarra").single()).data!.id;
  await page.goto(`/habitos/${guitarra}/editar`);
  await expect(page.getByRole("radiogroup", { name: "Registro detallado" }).getByRole("radio", { name: "Tiempo" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("radiogroup", { name: "Registro detallado" }).getByRole("radio", { name: "Distancia" }).click();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page).toHaveURL(new RegExp(`/habitos/${guitarra}$`));
  expect((await admin().from("habits").select("log_type").eq("id", guitarra).single()).data!.log_type).toBe("cardio");

  // the database rule behind the form: a habit with steps refuses a log type (items_with_log)
  const steps = await addHabit(u, "Rutina", "check", "none");
  await admin().from("habit_items").insert({ habit_id: steps, user_id: u.id, label: "Uno", position: 0 });
  const refused = await (await sessionOf(u)).from("habits").update({ log_type: "quantity", ...WATER }).eq("id", steps);
  expect(refused.error?.message).toContain("items_with_log");
});

test("privacy: a friend never sees amounts, subjects, titles or distances", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const owner = await makeUser("dueno", "Dani");
  const friend = await makeUser("amigo", "Fer");
  const { error } = await admin().from("friendships").insert({ requester_id: owner.id, addressee_id: friend.id, status: "accepted" });
  expect(error).toBeNull();
  const db = await sessionOf(owner);
  const agua = await addHabit(owner, "Agua", "drop", "quantity", { preset: "water", visibility: "friends", ...WATER });
  const estudiar = await addHabit(owner, "Estudiar", "book-open", "time", { preset: "study", visibility: "friends" });
  const series = await addHabit(owner, "Series y películas", "television", "watch", { preset: "watch", visibility: "friends" });
  const trotar = await addHabit(owner, "Trotar", "sneaker-move", "cardio", { preset: "run", visibility: "friends" });
  expect((await db.rpc("add_quantity_entry", { p_habit_id: agua, p_entry_id: crypto.randomUUID(), p_amount: 2000 })).error).toBeNull();
  expect((await db.rpc("add_time", { p_habit_id: estudiar, p_minutes: 85, p_topic: "Álgebra" })).error).toBeNull();
  const media = await db.from("media_items").insert({ user_id: owner.id, title: "Dark", kind: "series" }).select("id").single();
  expect(media.error).toBeNull();
  const ck = await db.rpc("create_checkin", { p_habit_id: series });
  const seriesCheckin = (ck.data as { checkin_id: string }[])[0].checkin_id;
  const saved = await db.rpc("save_watch_entry", {
    p_checkin_id: seriesCheckin,
    p_media_id: media.data!.id,
    p_episodes: 3,
    p_season: 1,
    p_episode_to: 3,
    p_minutes: null,
    p_completed: false,
  } as never);
  expect(saved.error).toBeNull();
  const ck2 = await db.rpc("create_checkin", { p_habit_id: trotar });
  const run = await db.rpc("add_cardio_entry", {
    p_checkin_id: (ck2.data as { checkin_id: string }[])[0].checkin_id,
    p_kind: "run",
    p_distance_m: 5200,
    p_duration_s: 1780,
  });
  expect(run.error).toBeNull();

  // the owner sees them on Hoy
  await logIn(page, owner.email, PASSWORD);
  await expect(page.getByText("3 episodios · Dark")).toBeVisible();
  await expect(page.getByText("5,2 km · 29:40 · 5:42 /km")).toBeVisible();
  await expect(page.getByText("1 h 25 min · Álgebra")).toBeVisible();

  // the friend sees the habits and check-ins, never the log
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const f = await ctx.newPage();
  await logIn(f, friend.email, PASSWORD);
  for (const path of [`/@${owner.handle}`, "/amigos"]) {
    await f.goto(path);
    await f.waitForLoadState("networkidle");
    const text = await f.locator("body").innerText();
    for (const secret of ["vasos", "Álgebra", "Dark", "km", "5,2", "2.000"]) {
      expect(text, `${secret} on ${path}`).not.toContain(secret);
    }
  }
  await f.goto(`/@${owner.handle}`);
  await expect(f.getByText("Trotar").first()).toBeVisible();
  await ctx.close();
});

test("Hoy at 375 px with one habit of every log type: no horizontal scroll, screenshots in both themes", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const u = await makeUser("todos");
  const db = await sessionOf(u);
  const none = await addHabit(u, "Meditar", "flame", "none");
  const reading = await addHabit(u, "Leer", "book-open", "reading", { preset: "read" });
  const workout = await addHabit(u, "Gimnasio", "barbell", "workout", { preset: "gym", requires_photo: true });
  const time = await addHabit(u, "Estudiar", "book-open", "time", { preset: "study" });
  const watch = await addHabit(u, "Series y películas", "television", "watch", { preset: "watch" });
  const qty = await addHabit(u, "Agua", "drop", "quantity", { preset: "water", ...WATER });
  const cardio = await addHabit(u, "Trotar", "sneaker-move", "cardio", { preset: "run" });
  void none;
  void reading;
  void workout;
  expect((await db.rpc("add_time", { p_habit_id: time, p_minutes: 85, p_topic: "Álgebra" })).error).toBeNull();
  expect((await db.rpc("add_quantity_entry", { p_habit_id: qty, p_entry_id: crypto.randomUUID(), p_amount: 1250 })).error).toBeNull();
  const media = await db.from("media_items").insert({ user_id: u.id, title: "Dark", kind: "series" }).select("id").single();
  const ck = await db.rpc("create_checkin", { p_habit_id: watch });
  expect(
    (
      await db.rpc("save_watch_entry", {
        p_checkin_id: (ck.data as { checkin_id: string }[])[0].checkin_id,
        p_media_id: media.data!.id,
        p_episodes: 3,
        p_season: 1,
        p_episode_to: 3,
        p_minutes: null,
        p_completed: false,
      } as never)
    ).error,
  ).toBeNull();
  const ck2 = await db.rpc("create_checkin", { p_habit_id: cardio });
  expect(
    (
      await db.rpc("add_cardio_entry", {
        p_checkin_id: (ck2.data as { checkin_id: string }[])[0].checkin_id,
        p_kind: "run",
        p_distance_m: 5200,
        p_duration_s: 1780,
      })
    ).error,
  ).toBeNull();

  await logIn(page, u.email, PASSWORD);
  await expect(page.getByText("5 de 8 vasos")).toBeVisible();
  await expect(page.getByText("5,2 km · 29:40 · 5:42 /km")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await noScroll(page);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.screenshot({ path: `.superpowers/sdd/2026-11-22-konjo/t28-shots/hoy-375-${scheme}.png`, fullPage: true });
    await noScroll(page);
  }
});

test("deleting the account removes every v4 row of the user", async ({ page }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const u = await makeUser("borra");
  const db = await sessionOf(u);
  const time = await addHabit(u, "Estudiar", "book-open", "time", { preset: "study" });
  const watch = await addHabit(u, "Series y películas", "television", "watch", { preset: "watch" });
  const qty = await addHabit(u, "Agua", "drop", "quantity", { preset: "water", ...WATER });
  const cardio = await addHabit(u, "Trotar", "sneaker-move", "cardio", { preset: "run" });
  expect((await db.rpc("add_time", { p_habit_id: time, p_minutes: 30, p_topic: "Álgebra" })).error).toBeNull();
  expect(
    (await db.rpc("add_pomodoro_block", { p_habit_id: time, p_block_id: crypto.randomUUID(), p_minutes: 25 })).error,
  ).toBeNull();
  expect((await db.rpc("add_quantity_entry", { p_habit_id: qty, p_entry_id: crypto.randomUUID(), p_amount: 500 })).error).toBeNull();
  const media = await db.from("media_items").insert({ user_id: u.id, title: "Dark", kind: "series" }).select("id").single();
  const ck = await db.rpc("create_checkin", { p_habit_id: watch });
  expect(
    (
      await db.rpc("save_watch_entry", {
        p_checkin_id: (ck.data as { checkin_id: string }[])[0].checkin_id,
        p_media_id: media.data!.id,
        p_episodes: 1,
        p_season: 1,
        p_episode_to: 1,
        p_minutes: null,
        p_completed: false,
      } as never)
    ).error,
  ).toBeNull();
  const ck2 = await db.rpc("create_checkin", { p_habit_id: cardio });
  expect(
    (
      await db.rpc("add_cardio_entry", {
        p_checkin_id: (ck2.data as { checkin_id: string }[])[0].checkin_id,
        p_kind: "run",
        p_distance_m: 3000,
        p_duration_s: 1200,
      })
    ).error,
  ).toBeNull();

  const V4 = ["time_entries", "pomodoro_blocks", "media_items", "watch_entries", "quantity_entries", "cardio_entries"] as const;
  const service = admin();
  for (const t of V4) {
    const { count } = await service.from(t).select("*", { count: "exact", head: true }).eq("user_id", u.id);
    expect(count, `${t} before`).toBeGreaterThan(0);
  }

  await logIn(page, u.email, PASSWORD);
  await page.goto("/perfil/ajustes");
  await page.getByRole("button", { name: /Borrar cuenta/ }).click();
  const sheet = page.getByRole("dialog", { name: "Borrar cuenta" });
  await sheet.getByLabel(`Para confirmar, escribe @${u.handle}`).fill(`@${u.handle}`);
  await sheet.getByRole("button", { name: "Borrar mi cuenta" }).click();
  await expect(page).toHaveURL(/\/bienvenida|\/login/, { timeout: 30_000 });

  for (const t of V4) {
    const { count, error } = await service.from(t).select("*", { count: "exact", head: true }).eq("user_id", u.id);
    expect(error, t).toBeNull();
    expect(count, `${t} after`).toBe(0);
  }
  const { count: habits } = await service.from("habits").select("*", { count: "exact", head: true }).eq("user_id", u.id);
  expect(habits).toBe(0);
});
