import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { addDays } from "../../src/domain/dates";
import { logIn, PASSWORD, randomHandle, expectNotFound } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase (E2E_SUPABASE=1)");

const TZ = "America/Santiago";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

type Seed = {
  handle: string;
  habitId: string;
  plainHabitId: string;
  archivedHabitId: string;
  otherHabitId: string;
  photoHabitId: string;
};
const REJECTED_DAY = addDays(today, -2);

/**
 * One user with a Gimnasio-like habit (log_type workout, no photo required) and today's check-in.
 * Service role is test tooling only: the app itself never writes check-ins from a client.
 */
const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function createUser(handle: string): Promise<string> {
  const { data: created, error } = await admin().auth.admin.createUser({
    email: `${handle}@example.com`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      username: handle,
      first_name: "Gabi",
      last_name: "E2E",
      birth_date: "1993-05-05",
      timezone: TZ,
      terms_accepted: true,
    },
  });
  expect(error).toBeNull();
  return created.user!.id;
}

async function insertHabit(userId: string, extra: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin()
    .from("habits")
    .insert({
      user_id: userId,
      name: "Gimnasio",
      icon: "barbell",
      frequency_type: "weekly",
      target_per_week: 3,
      color: "cielo",
      log_type: "workout",
      ...extra,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id;
}

async function seed(): Promise<Seed> {
  const handle = randomHandle("gym");
  const userId = await createUser(handle);
  const otherId = await createUser(randomHandle("gymo"));
  const habitId = await insertHabit(userId, {});
  const plainHabitId = await insertHabit(userId, { name: "Agua", icon: "drop", log_type: "none" });
  const archivedHabitId = await insertHabit(userId, { name: "Gym viejo", archived_at: new Date().toISOString() });
  const photoHabitId = await insertHabit(userId, { name: "Gym con foto", preset: "gym", requires_photo: true });
  const otherHabitId = await insertHabit(otherId, {});
  const { error } = await admin()
    .from("checkins")
    .insert([
      { habit_id: habitId, user_id: userId, local_date: today },
      { habit_id: archivedHabitId, user_id: userId, local_date: today },
      { habit_id: otherHabitId, user_id: otherId, local_date: today },
      {
        habit_id: habitId,
        user_id: userId,
        local_date: REJECTED_DAY,
        rejected_at: new Date().toISOString(),
        rejected_by: otherId,
        reject_reason: "other",
      },
    ]);
  expect(error).toBeNull();
  return { handle, habitId, plainHabitId, archivedHabitId, otherHabitId, photoHabitId };
}

let data: Seed;
test.beforeAll(async () => {
  data = await seed();
});

const pick = async (page: Page, name: string) => {
  await page.getByRole("button", { name: "Agregar ejercicio" }).click();
  await page.getByRole("dialog").getByRole("button", { name, exact: true }).click();
};

test("entrenamiento: registrar un día de pierna, verlo, editar un peso y borrarlo", async ({ page }) => {
  await logIn(page, `@${data.handle}`, PASSWORD);
  const url = `/habitos/${data.habitId}/entrenamiento`;

  // a day without check-in explains itself
  await page.goto(`${url}?fecha=${addDays(today, -1)}`);
  await expect(page.getByText("Ese día no tiene check-in")).toBeVisible();
  await expect(page.getByText("Los registros se guardan sobre un día cumplido.")).toBeVisible();

  // a rejected check-in does not count as a day to log on
  await page.goto(`${url}?fecha=${REJECTED_DAY}`);
  await expect(page.getByText("Ese día no tiene check-in")).toBeVisible();

  // future or malformed dates fall back to today (same title as no date at all)
  await page.goto(url);
  const todayTitle = await page.getByRole("heading", { level: 1 }).textContent();
  expect(todayTitle).toMatch(/^Entrenamiento · /);
  await page.goto(`${url}?fecha=${addDays(today, 3)}`);
  await expect(page.getByRole("button", { name: "Guardar" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(todayTitle!);
  await page.goto(`${url}?fecha=basura`);
  await expect(page.getByRole("button", { name: "Guardar" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(todayTitle!);

  // coming from Hoy, saving goes back there
  await page.goto("/");
  await page.goto(url);
  await page.getByRole("button", { name: "Pierna" }).click();

  await pick(page, "Sentadilla");
  await page.getByLabel("Repeticiones de la serie 1 de Sentadilla").fill("5");
  await page.getByLabel("Peso en kilos de la serie 1 de Sentadilla").fill("80");
  // a new set copies the previous one
  await page.getByRole("button", { name: "Agregar serie a Sentadilla" }).click();
  await expect(page.getByLabel("Repeticiones de la serie 2 de Sentadilla")).toBeFocused();
  await expect(page.getByLabel("Repeticiones de la serie 2 de Sentadilla")).toHaveValue("5");
  await expect(page.getByLabel("Peso en kilos de la serie 2 de Sentadilla")).toHaveValue("80");

  await pick(page, "Prensa");
  // a picked exercise takes focus on its first reps input
  await expect(page.getByLabel("Repeticiones de la serie 1 de Prensa")).toBeFocused();
  await page.getByLabel("Repeticiones de la serie 1 de Prensa").fill("10");
  await page.getByLabel("Peso en kilos de la serie 1 de Prensa").fill("120,5");

  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Entrenamiento guardado")).toBeVisible();
  await expect(page).toHaveURL(/\/$/, { timeout: 5_000 }); // it goes back to Hoy by itself
  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible();

  // reload: the saved workout is back
  await page.goto(url);
  await expect(page.getByRole("button", { name: "Pierna" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Peso en kilos de la serie 2 de Sentadilla")).toHaveValue("80");
  await expect(page.getByLabel("Peso en kilos de la serie 1 de Prensa")).toHaveValue("120,5");

  // edit one weight
  await page.getByLabel("Peso en kilos de la serie 2 de Sentadilla").fill("82,5");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Entrenamiento guardado")).toBeVisible();
  await expect(page.getByText("Entrenamiento guardado")).toBeHidden();
  await page.goto(url);
  await expect(page.getByLabel("Peso en kilos de la serie 2 de Sentadilla")).toHaveValue("82,5");
  await expect(page.getByLabel("Peso en kilos de la serie 1 de Sentadilla")).toHaveValue("80");

  // delete it (the check-in stays)
  await page.getByRole("button", { name: "Borrar registro" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Borrar registro" }).click();
  await expect(page.getByText("Registro borrado")).toBeVisible();
  await expect(page.getByText("Registro borrado")).toBeHidden();
  await page.goto(url);
  await expect(page.getByRole("button", { name: "Pierna" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Borrar registro" })).toHaveCount(0);
});

test("entrenamiento: crear un ejercicio propio y el límite de series", async ({ page }) => {
  await logIn(page, `@${data.handle}`, PASSWORD);
  await page.goto(`/habitos/${data.habitId}/entrenamiento`);
  await page.getByRole("button", { name: "Espalda" }).click();

  await page.getByRole("button", { name: "Agregar ejercicio" }).click();
  await page.getByRole("button", { name: "Nuevo ejercicio" }).click();
  await page.getByLabel("Nombre del ejercicio").fill("Remo Pendlay");
  await page.getByRole("dialog").getByRole("group", { name: "Grupo muscular" }).getByRole("button", { name: "Espalda" }).click();
  await page.getByRole("button", { name: "Crear" }).click();
  await expect(page.getByRole("heading", { name: "Remo Pendlay" })).toBeVisible();

  for (let i = 0; i < 9; i++) await page.getByRole("button", { name: "Agregar serie a Remo Pendlay" }).click();
  await expect(page.getByText("Máximo 10 series por ejercicio.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Agregar serie a Remo Pendlay" })).toBeDisabled();

  // ten set rows fit a 360 px screen: no horizontal scroll, the remove button stays on screen
  await page.setViewportSize({ width: 360, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const remove = await page.getByRole("button", { name: "Quitar la serie 10 de Remo Pendlay" }).boundingBox();
  expect(remove!.x + remove!.width).toBeLessThanOrEqual(360);
  await page.setViewportSize({ width: 390, height: 844 });

  // the same name again is refused
  await page.getByRole("button", { name: "Agregar ejercicio" }).click();
  await page.getByRole("button", { name: "Nuevo ejercicio" }).click();
  await page.getByLabel("Nombre del ejercicio").fill("remo pendlay");
  await page.getByRole("button", { name: "Crear" }).click();
  await expect(page.getByText("Ya tienes un ejercicio con ese nombre.")).toBeVisible();
});

test("entrenamiento: 404 para hábitos sin registro de gimnasio, archivados o ajenos", async ({ page }) => {
  await logIn(page, `@${data.handle}`, PASSWORD);
  for (const id of [data.plainHabitId, data.archivedHabitId, data.otherHabitId]) {
    await expectNotFound(page, `/habitos/${id}/entrenamiento`, id);
  }
});

test("entrenamiento: un error de serie marca el campo", async ({ page }) => {
  await logIn(page, `@${data.handle}`, PASSWORD);
  await page.goto(`/habitos/${data.habitId}/entrenamiento`);
  await page.getByRole("button", { name: "Pecho" }).click();
  await pick(page, "Press banca");
  await page.getByLabel("Repeticiones de la serie 1 de Press banca").fill("8");
  await page.getByRole("button", { name: "Guardar" }).click();
  const kg = page.getByLabel("Peso en kilos de la serie 1 de Press banca");
  await expect(kg).toHaveAttribute("aria-invalid", "true");
  await expect(kg).toHaveAccessibleDescription("Escribe el peso de cada serie (0 si es tu peso corporal).");
  await expect(page.getByLabel("Repeticiones de la serie 1 de Press banca")).not.toHaveAttribute("aria-invalid", "true");
});

test("gimnasio con foto: la celebración abre el registro y al guardar vuelve a Hoy", async ({ page }) => {
  // no camera in CI: the flow falls back to the native picker, fed with a generated JPEG
  await page.addInitScript(() => Object.defineProperty(navigator, "mediaDevices", { value: undefined }));
  await logIn(page, `@${data.handle}`, PASSWORD);
  const jpeg = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#5a5ac2";
    g.fillRect(0, 0, 64, 64);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });

  await page.getByRole("link", { name: "Foto", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/habitos/${data.photoHabitId}/foto`));
  await page.locator('input[type="file"]').setInputFiles({
    name: "gym.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(jpeg, "base64"),
  });
  await page.getByRole("button", { name: "Usar esta foto" }).click();
  const sheet = page.getByRole("dialog", { name: "Entrenamiento cumplido" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Registrar entrenamiento" }).click();
  await expect(page).toHaveURL(new RegExp(`/habitos/${data.photoHabitId}/entrenamiento$`));

  await page.getByRole("button", { name: "Cardio" }).click();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Entrenamiento guardado")).toBeVisible();
  // back skips the (replaced) camera page and lands on Hoy
  await expect(page).toHaveURL(/\/$/, { timeout: 5_000 });
  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible();
  await expect(page.getByText(/^Cardio/)).toBeVisible();
});
