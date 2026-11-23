import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { logIn, PASSWORD, randomHandle } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs the local Supabase stack (E2E_SUPABASE=1)");

const TZ = "America/Santiago";

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** Own user with a "Trotar" distance habit checked in today (test setup only; the outings go through the UI). */
async function setup() {
  const handle = randomHandle("cardio");
  const db = admin();
  const { data, error } = await db.auth.admin.createUser({
    email: `${handle}@example.com`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username: handle, first_name: "Lu", last_name: "E2E", birth_date: "1992-04-04", timezone: TZ, terms_accepted: true },
  });
  expect(error).toBeNull();
  const userId = data.user!.id;
  const { data: habit, error: he } = await db
    .from("habits")
    .insert({ user_id: userId, name: "Trotar", icon: "sneaker-move", frequency_type: "daily", color: "cielo", log_type: "cardio" })
    .select("id")
    .single();
  expect(he).toBeNull();
  // the check-in goes through the same RPC the app uses, as the signed-in user (never the service role)
  const user = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signIn } = await user.auth.signInWithPassword({ email: `${handle}@example.com`, password: PASSWORD });
  expect(signIn).toBeNull();
  const { error: ce } = await user.rpc("create_checkin", { p_habit_id: habit!.id });
  expect(ce).toBeNull();
  return { habitId: habit!.id as string, email: `${handle}@example.com` };
}

const sheet = (page: Page) => page.getByRole("dialog");

async function fillOuting(page: Page, distance: string, h: string, m: string, s: string) {
  const d = sheet(page);
  await d.getByLabel("Distancia").fill(distance);
  await d.getByLabel("Horas").fill(h);
  await d.getByLabel("Minutos").fill(m);
  await d.getByLabel("Segundos").fill(s);
}

test("day editor: add, repeat the last, swim, edit and delete outings", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { habitId, email } = await setup();
  await logIn(page, email, PASSWORD);
  await page.goto(`/habitos/${habitId}/distancia`);
  await expect(page.getByRole("heading", { name: "Distancia" })).toBeVisible();

  // first outing: live pace and speed, then the row
  await page.getByRole("button", { name: "Salida", exact: true }).click();
  await expect(sheet(page)).toHaveAccessibleName("¿Cuánto trotaste hoy?");
  await fillOuting(page, "5,2", "0", "29", "40");
  await expect(sheet(page).getByText("5:42 /km · 10,5 km/h")).toBeVisible();
  await sheet(page).getByRole("button", { name: "Guardar" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByText("Trote · 5,2 km · 29:40 · 5:42 /km")).toBeVisible();

  // second outing: a walk
  await page.getByRole("button", { name: "Salida", exact: true }).click();
  await sheet(page).getByRole("button", { name: "Caminata" }).click();
  await expect(sheet(page)).toHaveAccessibleName("¿Cuánto caminaste hoy?");
  await fillOuting(page, "2,5", "0", "30", "0");
  await sheet(page).getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Caminata · 2,5 km · 30:00 · 12:00 /km")).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar salida" })).toHaveCount(2);

  // "Repetir el último" brings the walk back
  await page.getByRole("button", { name: "Salida", exact: true }).click();
  await sheet(page).getByRole("button", { name: "Repetir el último" }).click();
  await expect(sheet(page).getByRole("button", { name: "Caminata" })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet(page).getByLabel("Distancia")).toHaveValue("2,5");
  await expect(sheet(page).getByLabel("Minutos")).toHaveValue("30");
  await sheet(page).getByRole("button", { name: "Cerrar" }).click();
  await expect(sheet(page)).toHaveCount(0);

  // swimming is written in metres, without a pace per km
  await page.getByRole("button", { name: "Salida", exact: true }).click();
  await sheet(page).getByRole("button", { name: "Natación" }).click();
  await expect(sheet(page)).toHaveAccessibleName("¿Cuánto nadaste hoy?");
  await fillOuting(page, "1500", "0", "30", "0");
  await sheet(page).getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Natación · 1.500 m · 30:00", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar salida" })).toHaveCount(3);

  // edit the first outing to 5 km
  await page.getByRole("button", { name: "Editar salida" }).first().click();
  await expect(sheet(page)).toHaveAccessibleName("Editar salida");
  await sheet(page).getByLabel("Distancia").fill("5");
  await sheet(page).getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Trote · 5 km · 29:40 · 5:56 /km")).toBeVisible();
  await expect(page.getByText("Trote · 5,2 km")).toHaveCount(0);

  // delete the walk: confirmation first, then one row less
  await page.getByRole("button", { name: "Borrar salida" }).nth(1).click();
  await expect(page.getByText("Se borrará esta salida. Tu check-in no cambia.")).toBeVisible();
  await page.getByRole("button", { name: "Borrar", exact: true }).click();
  await expect(page.getByText("Caminata · 2,5 km")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Editar salida" })).toHaveCount(2);
});

test("invalid fields are marked; 375 px has no horizontal scroll", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { habitId, email } = await setup();
  await logIn(page, email, PASSWORD);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/habitos/${habitId}/distancia`);
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await page.getByRole("button", { name: "Salida", exact: true }).click();
  await sheet(page).getByRole("button", { name: "Guardar" }).click();
  await expect(sheet(page).getByLabel("Distancia")).toHaveAttribute("aria-invalid", "true");
  await expect(sheet(page).getByLabel("Horas")).toHaveAttribute("aria-invalid", "true");
  await expect(sheet(page).getByLabel("Segundos")).toHaveAttribute("aria-invalid", "true");
  await expect(sheet(page).getByText("Escribe la distancia.")).toBeVisible();
  await expect(sheet(page).getByText("Escribe el tiempo.")).toBeVisible();
  // an empty pace never reads NaN or Infinity
  await expect(sheet(page).getByText("—", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test("minutes above 59 have their own message tied to the time fields; repeat copies effort and note", async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { habitId, email } = await setup();
  await logIn(page, email, PASSWORD);
  await page.goto(`/habitos/${habitId}/distancia`);
  await expect(page.getByRole("heading", { name: "Distancia" })).toBeVisible();

  await page.getByRole("button", { name: "Salida", exact: true }).click();
  await fillOuting(page, "5", "0", "75", "0");
  await sheet(page).getByRole("button", { name: "Guardar" }).click();
  const timeError = sheet(page).getByText("Minutos y segundos van de 0 a 59.");
  await expect(timeError).toBeVisible();
  const errorId = await timeError.getAttribute("id");
  expect(errorId).toBeTruthy();
  for (const label of ["Horas", "Minutos", "Segundos"]) {
    await expect(sheet(page).getByLabel(label)).toHaveAttribute("aria-describedby", errorId!);
  }

  // a valid outing with effort and note, then repeat it
  await sheet(page).getByLabel("Minutos").fill("25");
  await sheet(page).getByRole("radio", { name: "4" }).click();
  await sheet(page).getByLabel("Nota (opcional)").fill("Parque");
  await sheet(page).getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Trote · 5 km · 25:00 · 5:00 /km")).toBeVisible();
  await expect(sheet(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Salida", exact: true }).click();
  await expect(sheet(page).getByRole("radio", { name: "4" })).toHaveAttribute("aria-checked", "false");
  await sheet(page).getByRole("button", { name: "Repetir el último" }).click();
  await expect(sheet(page).getByRole("radio", { name: "4" })).toHaveAttribute("aria-checked", "true");
  await expect(sheet(page).getByLabel("Nota (opcional)")).toHaveValue("Parque");
  await expect(sheet(page).getByText("Copiamos tu última salida, con esfuerzo y nota.")).toBeVisible();
});
