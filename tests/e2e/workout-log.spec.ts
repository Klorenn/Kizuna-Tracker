import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { addDays } from "../../src/domain/dates";
import { logIn, PASSWORD, randomHandle } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase (E2E_SUPABASE=1)");

const TZ = "America/Santiago";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

type Seed = { handle: string; habitId: string };

/**
 * One user with a Gimnasio-like habit (log_type workout, no photo required) and today's check-in.
 * Service role is test tooling only: the app itself never writes check-ins from a client.
 */
async function seed(): Promise<Seed> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const handle = randomHandle("gym");
  const { data: created, error } = await admin.auth.admin.createUser({
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
  const userId = created.user!.id;
  const { data: habit, error: e1 } = await admin
    .from("habits")
    .insert({
      user_id: userId,
      name: "Gimnasio",
      icon: "barbell",
      frequency_type: "weekly",
      target_per_week: 3,
      color: "cielo",
      log_type: "workout",
    })
    .select("id")
    .single();
  expect(e1).toBeNull();
  const { error: e2 } = await admin
    .from("checkins")
    .insert({ habit_id: habit!.id, user_id: userId, local_date: today });
  expect(e2).toBeNull();
  return { handle, habitId: habit!.id };
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

  // future or malformed dates fall back to today
  await page.goto(`${url}?fecha=${addDays(today, 3)}`);
  await expect(page.getByRole("button", { name: "Guardar" })).toBeVisible();
  await page.goto(`${url}?fecha=basura`);
  await expect(page.getByRole("button", { name: "Guardar" })).toBeVisible();

  await page.goto(url);
  await page.getByRole("button", { name: "Pierna" }).click();

  await pick(page, "Sentadilla");
  await page.getByLabel("Repeticiones de la serie 1 de Sentadilla").fill("5");
  await page.getByLabel("Peso en kilos de la serie 1 de Sentadilla").fill("80");
  // a new set copies the previous one
  await page.getByRole("button", { name: "Agregar serie a Sentadilla" }).click();
  await expect(page.getByLabel("Repeticiones de la serie 2 de Sentadilla")).toHaveValue("5");
  await expect(page.getByLabel("Peso en kilos de la serie 2 de Sentadilla")).toHaveValue("80");

  await pick(page, "Prensa");
  await page.getByLabel("Repeticiones de la serie 1 de Prensa").fill("10");
  await page.getByLabel("Peso en kilos de la serie 1 de Prensa").fill("120,5");

  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Entrenamiento guardado")).toBeVisible();
  await expect(page.getByText("Entrenamiento guardado")).toBeHidden(); // it goes back by itself

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

  // the same name again is refused
  await page.getByRole("button", { name: "Agregar ejercicio" }).click();
  await page.getByRole("button", { name: "Nuevo ejercicio" }).click();
  await page.getByLabel("Nombre del ejercicio").fill("remo pendlay");
  await page.getByRole("button", { name: "Crear" }).click();
  await expect(page.getByText("Ya tienes un ejercicio con ese nombre.")).toBeVisible();
});
