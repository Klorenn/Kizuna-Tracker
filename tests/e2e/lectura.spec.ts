import { expect, test, type Page } from "@playwright/test";
import { createPresetHabit, expectNoHorizontalScroll, randomHandle, signUp } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs the local Supabase stack");

/** Optional screenshots (LECTURA_SHOTS=<dir>): 360 and 390 px, light and dark. */
async function shot(page: Page, name: string) {
  const dir = process.env.LECTURA_SHOTS;
  if (!dir) return;
  const size = page.viewportSize();
  for (const width of [360, 390]) {
    for (const scheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      // let the 120 ms color transitions settle
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/${name}-${width}-${scheme}.png` });
    }
  }
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  if (size) await page.setViewportSize(size);
}

const dialog = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });

test("reading, rest, study and book celebrations on Hoy; books and the day reading page", async ({ page }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signUp(page, randomHandle("lect"));
  for (const preset of ["Agua", "Leer", "Dormir 8 h", "Estudiar"]) await createPresetHabit(page, preset);

  // the form offers the detailed log for habits without steps
  await page.goto("/habitos/nuevo");
  await page.getByRole("button", { name: "Leer", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Lectura" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Comer bien", exact: true }).click();
  await expect(page.getByRole("radiogroup", { name: "Registro detallado" })).toHaveCount(0);
  await page.getByRole("button", { name: "Otro", exact: true }).click();
  await page.getByRole("radiogroup", { name: "Registro detallado" }).scrollIntoViewIfNeeded();
  await shot(page, "01-habit-form");

  // Hoy → Leer → sheet (no books: the new book form starts open)
  await page.goto("/");
  await page.getByRole("checkbox", { name: "Leer" }).click();
  const sheet = dialog(page, "¿Qué leíste hoy?");
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Título").fill("Dune");
  await sheet.getByLabel("Páginas del libro (opcional)").fill("412");
  await sheet.getByRole("button", { name: "Agregar libro" }).click();
  await expect(sheet.getByRole("button", { name: "Dune" })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByLabel("Desde").fill("14");
  await sheet.getByLabel("Hasta").fill("40");
  await expect(sheet.getByText("26 páginas")).toBeVisible();
  await shot(page, "02-reading-sheet");
  await sheet.getByRole("button", { name: "Guardar" }).click();
  const read = dialog(page, "Lectura registrada");
  await expect(read).toBeVisible();
  await expect(read.getByText("26 páginas")).toBeVisible();
  await shot(page, "03-reading-done");
  await read.getByRole("button", { name: "Listo" }).click();
  await expect(page.getByText("26 páginas · Dune")).toBeVisible();

  // Dormir 8 h → sleeping cat; Estudiar → typing cat
  await page.getByRole("checkbox", { name: "Dormir 8 h" }).click();
  const rest = dialog(page, "Descanso registrado");
  await expect(rest).toBeVisible();
  await shot(page, "04-rest-done");
  await rest.getByRole("button", { name: "Listo" }).click();
  await page.getByRole("checkbox", { name: "Estudiar" }).click();
  const study = dialog(page, "Estudio registrado");
  await expect(study).toBeVisible();
  await shot(page, "05-study-done");
  await study.getByRole("button", { name: "Listo" }).click();

  // undo with a reading asks first, then read again and finish the book
  await page.getByRole("checkbox", { name: "Leer" }).click();
  const undo = dialog(page, "¿Deshacer el hábito de hoy?");
  await expect(undo.getByText("Se borrará también la lectura de hoy.")).toBeVisible();
  await undo.getByRole("button", { name: "Deshacer" }).click();
  await expect(page.getByText("26 páginas · Dune")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Leer" }).click();
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Desde").fill("40");
  await sheet.getByLabel("Hasta").fill("412");
  await sheet.getByText("Terminé este libro").click();
  await sheet.getByRole("button", { name: "Guardar" }).click();
  const book = dialog(page, "Terminaste Dune");
  await expect(book).toBeVisible();
  await shot(page, "06-book-done");
  await book.getByRole("button", { name: "Listo" }).click();

  // last habit → only "Día completo", then the quiet end-of-day state
  await page.getByRole("checkbox", { name: "Agua" }).click();
  const day = dialog(page, "Día completo");
  await expect(day).toBeVisible();
  await day.getByRole("button", { name: "Listo" }).click();
  await expect(page.getByText("Listo por hoy. Descansa.")).toBeVisible();
  await shot(page, "07-end-of-day");

  // /libros: Dune is finished, with its readings counted for the delete confirmation
  await page.goto("/libros");
  await expect(page.getByRole("heading", { name: "TERMINADOS" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Dune/ })).toBeVisible();
  await shot(page, "08-libros");
  await page.getByRole("button", { name: /Dune/ }).click();
  await dialog(page, "Editar libro").getByRole("button", { name: "Borrar libro" }).click();
  await expect(
    dialog(page, "¿Borrar Dune?").getByText("Se borrará 1 lectura (372 páginas). Tus check-ins no cambian."),
  ).toBeVisible();
  await shot(page, "09-libros-delete");
  await dialog(page, "¿Borrar Dune?").getByRole("button", { name: "Cancelar" }).click();

  // the day reading page: edit today's entry; a day without check-in is an empty state
  await page.goto("/");
  const href = await page.getByRole("link", { name: "Leer" }).getAttribute("href");
  await page.goto(`${href}/lectura`);
  await expect(page.getByLabel("Hasta")).toHaveValue("412");
  await shot(page, "10-lectura-page");
  await page.getByLabel("Desde").fill("300");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Lectura guardada")).toBeVisible();
  await page.goto(`${href}/lectura?fecha=2020-01-01`);
  await expect(page.getByText("Ese día no tiene check-in")).toBeVisible();
  await shot(page, "11-lectura-empty");

  await expectNoHorizontalScroll(page, ["/", "/libros", `${href}/lectura`]);
});
