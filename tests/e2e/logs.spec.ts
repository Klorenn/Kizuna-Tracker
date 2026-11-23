import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { monthTitle, shiftMonth } from "../../src/domain/calendar";
import { logIn, PASSWORD, randomHandle, SEED_PASSWORD, signUp } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase seeded with supabase/seed.sql (E2E_SUPABASE=1)");

// Seeded numbers (supabase/seed.sql, "detailed logs" block): today Dune 14 -> 40 and a leg day
// (Sentadilla 5 x 75 / 5 x 80, Prensa 10 x 120, Extensión 12 x 30); last month Sentadilla 60,
// Prensa 100 and "El nombre del viento" finished; latest weight 71,9 kg today.
const TZ = "America/Santiago";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const m1 = shiftMonth(today.slice(0, 7), -1);

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** A fresh user (service role is test tooling only). */
async function makeUser(prefix: string): Promise<{ id: string; handle: string }> {
  const handle = randomHandle(prefix);
  const { data, error } = await admin().auth.admin.createUser({
    email: `${handle}@example.com`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username: handle, first_name: "Lu", last_name: "E2E", birth_date: "1992-04-04", timezone: TZ, terms_accepted: true },
  });
  expect(error).toBeNull();
  return { id: data.user!.id, handle };
}

async function noHorizontalScroll(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(375);
}

test("user_a sees REGISTROS, the drill-downs, the calendar log and PROGRESO with the seeded numbers", async ({
  page,
}) => {
  // a stranger's own exercise, for the "foreign exercise -> 404" check
  const stranger = await makeUser("extr");
  const { data: foreign, error: fe } = await admin()
    .from("exercises")
    .insert({ user_id: stranger.id, name: "Remo raro", muscle_group: "back" })
    .select("id")
    .single();
  expect(fe).toBeNull();

  await logIn(page, "@user_a", SEED_PASSWORD);

  // Hoy: the seeded reading and leg day are the rows' subtitles
  await expect(page.getByText("26 páginas · Dune")).toBeVisible();
  await expect(page.getByText("Pierna · 3 ejercicios")).toBeVisible();

  // Resumen > REGISTROS
  await page.goto("/resumen");
  await expect(page.getByText(`Registros · ${monthTitle(today.slice(0, 7)).name}`)).toBeVisible();
  await expect(page.getByRole("link", { name: /^Páginas 26\./ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Peso 71,9 kg\..*Solo tú$/ })).toHaveAttribute("href", "/resumen/peso");
  const group = page.getByRole("link", { name: /^Pierna \+40 kg\./ });
  await expect(group).toBeVisible();

  // calendar day sheet of today: the reading and the workout under their habits, private weight
  await page.locator('[role="grid"] [aria-current="date"]').click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Dune")).toBeVisible();
  await expect(sheet.getByText("14 → 40 · 26 páginas")).toBeVisible();
  await expect(sheet.getByText(/5 × 80 kg/)).toBeVisible();
  await expect(sheet.getByText("Peso · 71,9 kg")).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Editar" }).first()).toHaveAttribute(
    "href",
    new RegExp(`/habitos/[0-9a-f-]+/(lectura|entrenamiento)\\?fecha=${today}$`),
  );
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // group drill-down -> exercise
  await group.click();
  await expect(page).toHaveURL(/\/resumen\/gimnasio\/legs$/);
  await expect(page.getByText(`Subiste 40 kg en pierna`)).toBeVisible();
  await expect(page.getByRole("link", { name: /Prensa.*\+20 kg/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Extensión de cuádriceps.*Nuevo/ })).toBeVisible();
  await page.getByRole("link", { name: /^Sentadilla/ }).click();
  await expect(page).toHaveURL(/\/resumen\/ejercicio\/[0-9a-f-]{36}$/);
  const exercisePath = new URL(page.url()).pathname;
  await expect(page.getByRole("img", { name: /Mejor peso por sesión de Sentadilla/ })).toBeVisible();
  await expect(page.getByText("Mejor marca")).toBeVisible();

  // reading drill-down of last month
  await page.goto(`/resumen/lectura?mes=${m1}`);
  await expect(page.getByRole("heading", { name: new RegExp(monthTitle(m1).name) })).toBeVisible();
  await expect(page.getByText("El nombre del viento").first()).toBeVisible();
  await page.getByRole("radio", { name: "12 meses" }).click();
  await expect(page).toHaveURL(/rango=12/);
  await expect(page.getByRole("img", { name: /^Páginas por mes:/ })).toBeVisible();

  await page.goto("/resumen/gimnasio");
  await expect(page.getByRole("link", { name: /Pierna.*\+40 kg/ })).toBeVisible();

  // habit detail > PROGRESO
  await page.goto(`/habitos/b0000000-0000-0000-0000-00000000000a`);
  await expect(page.getByText("Progreso", { exact: true })).toBeVisible();
  await expect(page.getByText("40 de 412")).toBeVisible();
  await page.goto(`/habitos/b0000000-0000-0000-0000-0000000000a2`);
  await expect(page.getByText("Progreso", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sentadilla.*Mejor 80 kg/ })).toBeVisible();

  // unknown group / foreign exercise -> 404
  const bad = await page.goto("/resumen/gimnasio/cardio");
  expect(bad?.status()).toBe(404);
  const foreignRes = await page.goto(`/resumen/ejercicio/${foreign!.id}`);
  expect(foreignRes?.status()).toBe(404);

  // edit today's workout from the calendar link: Extensión 30 -> 32,5, saved, and the leg group
  // progress (+40 kg) does not change. The owner's seed is put back in `finally`, through the
  // database, so a failure halfway can never leave the demo data changed.
  const editUrl = `/habitos/b0000000-0000-0000-0000-0000000000a2/entrenamiento?fecha=${today}`;
  const extension = "Extensión de cuádriceps";
  try {
    await page.goto(editUrl);
    const field = page.getByLabel(`Peso en kilos de la serie 1 de ${extension}`);
    await expect(field).toHaveValue("30");
    await field.fill("32,5");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Entrenamiento guardado")).toBeVisible();
    await expect(page).not.toHaveURL(/entrenamiento/, { timeout: 5_000 });
    await page.goto(editUrl);
    await expect(page.getByLabel(`Peso en kilos de la serie 1 de ${extension}`)).toHaveValue("32,5");
    await page.goto("/resumen");
    await expect(page.getByRole("link", { name: /^Pierna \+40 kg\./ })).toBeVisible();
  } finally {
    const db = admin();
    const { data: session } = await db
      .from("workout_sessions")
      .select("id")
      .eq("habit_id", "b0000000-0000-0000-0000-0000000000a2")
      .eq("local_date", today)
      .maybeSingle();
    const { data: ex } = await db.from("exercises").select("id").is("user_id", null).eq("name", extension).maybeSingle();
    if (session && ex) {
      const { error } = await db
        .from("workout_sets")
        .update({ weight_kg: 30 })
        .eq("session_id", session.id)
        .eq("exercise_id", ex.id);
      expect(error).toBeNull();
    }
  }

  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of [
    "/resumen",
    "/resumen/lectura",
    "/resumen/gimnasio",
    "/resumen/gimnasio/legs",
    exercisePath,
    "/habitos/b0000000-0000-0000-0000-00000000000a",
    "/habitos/b0000000-0000-0000-0000-0000000000a2",
  ]) {
    await noHorizontalScroll(page, path);
  }
});

test("a friend sees nothing of Ana's logs or weight on her profile", async ({ page }) => {
  await logIn(page, "@user_b", SEED_PASSWORD);
  await page.goto("/@user_a");
  await expect(page.getByRole("heading", { name: "Ana Prueba", level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const text = await page.locator("main").innerText();
  for (const leak of ["Dune", "páginas", "71,9", "Peso", "Sentadilla"]) expect(text).not.toContain(leak);
});

test("a user without habits still sees the Peso card, and a long value is never truncated at 360 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signUp(page, randomHandle("larga"));
  await page.goto("/perfil");
  const card = page.getByRole("region", { name: "Cuerpo" });
  await card.getByRole("button", { name: "Registrar peso" }).click();
  const sheet = page.getByRole("dialog", { name: "Registrar peso" });
  await sheet.getByLabel("Peso (kg)").fill("100,5");
  await sheet.getByRole("button", { name: "Guardar peso" }).click();
  await expect(sheet).toHaveCount(0);

  // no habits: the empty state and, under it, REGISTROS with the private weight
  await page.goto("/resumen");
  await expect(page.getByText("Todavía no tienes hábitos")).toBeVisible();
  const weight = page.getByRole("link", { name: /^Peso 100,5 kg\./ });
  await expect(weight).toBeVisible();
  await expect(weight.getByText("Este mes: sin datos suficientes")).toBeVisible();

  // the value is fully visible: no ellipsis, not clipped, inside the viewport
  const value = weight.locator("[data-value]");
  await expect(value).toHaveText("100,5 kg");
  const box = await value.evaluate((el) => ({
    ellipsis: getComputedStyle(el).textOverflow === "ellipsis",
    clipped: el.scrollWidth > el.clientWidth,
    right: el.getBoundingClientRect().right,
  }));
  expect(box.ellipsis).toBe(false);
  expect(box.clipped).toBe(false);
  expect(box.right).toBeLessThanOrEqual(360);
});

test("Hoy: undoing a check-in with a log asks first and names the log (even after a log type change); Añadir registro", async ({
  page,
}) => {
  const u = await makeUser("undo");
  const db = admin();
  const habit = async (name: string, icon: string, log_type: string) => {
    const { data, error } = await db
      .from("habits")
      .insert({ user_id: u.id, name, icon, frequency_type: "daily", color: "cielo", log_type })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data!.id as string;
  };
  const gymId = await habit("Pesas", "barbell", "workout");
  const readId = await habit("Lectura nocturna", "book", "reading");
  // a third, open habit keeps the day from completing (no celebration in the way)
  await habit("Agua", "drop", "none");
  const { data: checkins, error: ce } = await db
    .from("checkins")
    .insert([
      { habit_id: gymId, user_id: u.id, local_date: today },
      { habit_id: readId, user_id: u.id, local_date: today },
    ])
    .select("id,habit_id");
  expect(ce).toBeNull();
  const gymCheckin = checkins!.find((c) => c.habit_id === gymId)!.id;
  const { error: se } = await db
    .from("workout_sessions")
    .insert({ user_id: u.id, habit_id: gymId, checkin_id: gymCheckin, local_date: today, day_types: ["legs"] });
  expect(se).toBeNull();
  // the habit stopped being a workout habit after logging: the old workout still exists
  expect((await db.from("habits").update({ log_type: "none" }).eq("id", gymId)).error).toBeNull();

  await logIn(page, `@${u.handle}`, PASSWORD);
  await expect(page.getByText(/^Pierna/)).toBeVisible();

  // done reading habit without a log: "Añadir registro" opens the reading sheet
  await page.getByRole("button", { name: "Añadir registro" }).click();
  await expect(page.getByRole("dialog", { name: "Añadir lectura" })).toBeVisible();
  await page.keyboard.press("Escape");

  const box = page.getByRole("checkbox", { name: "Pesas" });
  await expect(box).toHaveAttribute("aria-checked", "true");
  await box.click();
  const confirm = page.getByRole("dialog", { name: "¿Deshacer el hábito de hoy?" });
  await expect(confirm).toHaveAccessibleDescription("Se borrará también el entrenamiento de hoy.");
  await confirm.getByRole("button", { name: "Cancelar" }).click();
  await expect(box).toHaveAttribute("aria-checked", "true");

  await box.click();
  await confirm.getByRole("button", { name: "Deshacer" }).click();
  await expect(box).toHaveAttribute("aria-checked", "false");
  await expect
    .poll(async () => (await db.from("workout_sessions").select("id").eq("checkin_id", gymCheckin)).data?.length)
    .toBe(0);
});
