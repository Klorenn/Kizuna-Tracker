import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { expectNoHorizontalScroll, logIn, PASSWORD, randomHandle } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase (E2E_SUPABASE=1)");

const TZ = "America/Santiago";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

type Seed = { email: string; userId: string; user: SupabaseClient; watch: string; watch2: string; read: string; read2: string };

/**
 * Seeds one user (service role: test tooling only) with habits of each log type. Entries and
 * check-ins are written with the user's own session through the RPCs, like the app does.
 */
async function seed(): Promise<Seed> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const handle = randomHandle("watch");
  const email = `${handle}@example.com`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      username: handle,
      first_name: "Vero",
      last_name: "E2E",
      birth_date: "1994-04-04",
      timezone: TZ,
      terms_accepted: true,
    },
  });
  expect(error).toBeNull();
  const userId = created.user!.id;
  const habit = async (name: string, icon: string, color: string, logType: string, preset: string | null) => {
    const { data, error: e } = await admin
      .from("habits")
      .insert({ user_id: userId, name, icon, frequency_type: "daily", color, log_type: logType, preset })
      .select("id")
      .single();
    expect(e).toBeNull();
    return data!.id as string;
  };
  const watch = await habit("Series y películas", "television", "rosa", "watch", "watch");
  const watch2 = await habit("Maratón", "television", "rosa", "watch", null);
  const read = await habit("Leer", "book-open", "salvia", "reading", "read");
  const read2 = await habit("Leer más", "book-open", "salvia", "reading", null);

  const user = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signIn } = await user.auth.signInWithPassword({ email, password: PASSWORD });
  expect(signIn).toBeNull();
  return { email, userId, user, watch, watch2, read, read2 };
}

async function checkIn(user: SupabaseClient, habitId: string): Promise<string> {
  const { data, error } = await user.rpc("create_checkin", { p_habit_id: habitId });
  expect(error).toBeNull();
  return (data as { checkin_id: string }[])[0].checkin_id;
}

let data: Seed;
test.beforeAll(async () => {
  data = await seed();
});

const dialog = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });

test("series y películas: títulos, registro del día, terminadas, borrar y páginas totales", async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await logIn(page, data.email, PASSWORD);

  // /series: add a series and a movie; both appear under VIENDO
  await page.goto("/series");
  await expect(page.getByText("Todavía no tienes títulos")).toBeVisible();
  await page.getByRole("button", { name: "Nuevo título" }).click();
  const add = dialog(page, "Nuevo título");
  await add.getByLabel("Título", { exact: true }).fill("Dark");
  await add.getByLabel("Temporadas (opcional)").fill("3");
  await add.getByLabel("Episodios totales (opcional)").fill("26");
  await add.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Título agregado")).toBeVisible();
  await page.getByRole("button", { name: "Nuevo título" }).click();
  await add.getByLabel("Título", { exact: true }).fill("Dune");
  await add.getByRole("radio", { name: "Película" }).click();
  await add.getByLabel("Duración en minutos (opcional)").fill("155");
  await add.getByRole("button", { name: "Guardar" }).click();
  const viendo = page.getByRole("region", { name: "VIENDO" });
  await expect(viendo.getByRole("button", { name: /Dark/ })).toBeVisible();
  await expect(viendo.getByRole("button", { name: /Dune/ })).toBeVisible();
  await expect(viendo.getByText("2 h 35 min")).toBeVisible();

  // the day page without a check-in is an empty state; with one, log Dark
  await page.goto(`/habitos/${data.watch}/visto`);
  await expect(page.getByText("Ese día no tiene check-in")).toBeVisible();
  const checkinId = await checkIn(data.user, data.watch);
  await page.reload();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByLabel("Episodios vistos").fill("3");
  await page.getByLabel("Temporada (opcional)").fill("1");
  await page.getByLabel("Hasta el episodio (opcional)").fill("3");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Registro guardado")).toBeVisible();

  // coming back shows the saved values; /series shows the progress
  await page.goto(`/habitos/${data.watch}/visto`);
  await expect(page.getByRole("button", { name: "Dark", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Episodios vistos")).toHaveValue("3");
  await expect(page.getByLabel("Temporada (opcional)")).toHaveValue("1");
  await expect(page.getByLabel("Hasta el episodio (opcional)")).toHaveValue("3");
  await page.goto("/series");
  await expect(page.getByText("3 de 26 episodios · T1 E3")).toBeVisible();

  // switch the same day to Dune, completed: it moves to TERMINADAS with today's date
  await page.goto(`/habitos/${data.watch}/visto`);
  await page.getByRole("button", { name: "Dune", exact: true }).click();
  await page.getByText("La vi completa").click();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Registro guardado")).toBeVisible();
  await page.goto("/series");
  const terminadas = page.getByRole("region", { name: "TERMINADAS" });
  const when = format(new Date(`${today}T12:00:00`), "d MMM yyyy", { locale: es });
  await expect(terminadas.getByRole("button", { name: /Dune/ })).toContainText(`Terminada el ${when}`);

  // deleting a title with records says how many (singular "1 registro")
  const second = await checkIn(data.user, data.watch2);
  const { data: dark } = await data.user.from("media_items").select("id").eq("title", "Dark").single();
  const { error: saved } = await data.user.rpc("save_watch_entry", {
    p_checkin_id: second,
    p_media_id: dark!.id,
    p_episodes: 3,
    p_season: 1,
    p_episode_to: 3,
    p_minutes: null,
    p_completed: false,
    p_finished: false,
  });
  expect(saved).toBeNull();
  expect(checkinId).not.toBe(second);
  await page.reload();
  await page.getByRole("button", { name: /Dark/ }).click();
  await dialog(page, "Editar título").getByRole("button", { name: "Borrar título" }).click();
  await expect(
    dialog(page, "¿Borrar Dark?").getByText("Se borrará 1 registro (3 episodios). Tus check-ins no cambian."),
  ).toBeVisible();
  await dialog(page, "¿Borrar Dark?").getByRole("button", { name: "Cancelar" }).click();

  // books: add the total to a book without one, read 14 → 40 and see the progress
  const { data: rayuela, error: be } = await data.user
    .from("books")
    .insert({ user_id: data.userId, title: "Rayuela" })
    .select("id")
    .single();
  expect(be).toBeNull();
  const readCheckin = await checkIn(data.user, data.read);
  const { error: re } = await data.user.rpc("save_reading_entry", {
    p_checkin_id: readCheckin,
    p_book_id: rayuela!.id,
    p_from_page: 14,
    p_to_page: 40,
    p_finished: false,
  });
  expect(re).toBeNull();
  await page.goto("/libros");
  await expect(page.getByRole("button", { name: /Rayuela/ })).toContainText("página 40");
  await page.getByRole("button", { name: /Rayuela/ }).click();
  await dialog(page, "Editar libro").getByLabel("Páginas totales (opcional)").fill("412");
  await dialog(page, "Editar libro").getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Libro guardado")).toBeVisible();
  await expect(page.getByRole("button", { name: /Rayuela/ })).toContainText("página 40 de 412 · 10 %");
  await expect(page.getByRole("progressbar", { name: "Progreso de Rayuela" })).toHaveAttribute("aria-valuenow", "10");

  // Hoy's reading sheet: a book without total offers "Añadir páginas totales"; reaching it marks "Terminé"
  const { error: fe } = await data.user.from("books").insert({ user_id: data.userId, title: "Ficciones" });
  expect(fe).toBeNull();
  await page.goto("/");
  await page.getByRole("checkbox", { name: "Leer más" }).click();
  const sheet = dialog(page, "¿Qué leíste hoy?");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Ficciones" }).click();
  await sheet.getByRole("button", { name: "Añadir páginas totales" }).click();
  await sheet.getByLabel("Páginas totales", { exact: true }).fill("120");
  await sheet.getByRole("button", { name: "Añadir total" }).click();
  await expect(sheet.getByRole("button", { name: "Añadir páginas totales" })).toHaveCount(0);
  await sheet.getByLabel("Hasta").fill("120");
  await expect(sheet.getByRole("checkbox", { name: "Terminé este libro" })).toBeChecked();
  await sheet.getByRole("button", { name: "Cerrar" }).click();

  await expectNoHorizontalScroll(page, ["/series", "/libros", `/habitos/${data.watch}/visto`]);
});
