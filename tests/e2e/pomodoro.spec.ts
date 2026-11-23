import { expect, test, type Page } from "@playwright/test";
import { createPresetHabit, expectNoHorizontalScroll, randomHandle, signUp } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs the local Supabase stack");

/** Optional screenshots (POMODORO_SHOTS=<dir>): 375 px, light and dark. */
async function shot(page: Page, name: string) {
  const dir = process.env.POMODORO_SHOTS;
  if (!dir) return;
  const size = page.viewportSize();
  await page.setViewportSize({ width: 375, height: 812 });
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/${name}-${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  if (size) await page.setViewportSize(size);
}

/** Signs up, creates "Estudiar" (a time habit) and returns its id. */
async function studyHabit(page: Page, prefix: string): Promise<string> {
  await signUp(page, randomHandle(prefix));
  await createPresetHabit(page, "Estudiar");
  const href = await page.getByRole("link", { name: /Estudiar/ }).first().getAttribute("href");
  const id = href?.match(/\/habitos\/([0-9a-f-]{36})/)?.[1];
  if (!id) throw new Error(`no habit id in ${href}`);
  return id;
}

const MIN = 60_000;

test("a pomodoro session: focus, break, reload, next round, finish early", async ({ page }) => {
  test.setTimeout(180_000);
  const id = await studyHabit(page, "pomo");
  await page.clock.install();
  await page.goto(`/habitos/${id}/pomodoro`);
  await expect(page.getByRole("heading", { name: "Pomodoro · Estudiar" })).toBeVisible();
  await shot(page, "01-idle");

  await page.getByRole("button", { name: "Personalizado" }).click();
  await page.getByLabel("Foco (min)").fill("5");
  await page.getByLabel("Descanso (min)").fill("1");
  await page.getByRole("button", { name: "Menos rondas" }).click();
  await page.getByRole("button", { name: "Menos rondas" }).click();
  await page.getByLabel("Qué estudiaste").fill("Álgebra");
  await page.getByRole("button", { name: "Empezar foco" }).click();
  await expect(page.getByRole("timer")).toHaveText("05:00");
  await expect(page.getByText("FOCO · RONDA 1 DE 2", { exact: true })).toBeVisible();
  await shot(page, "02-focus");

  await page.clock.runFor(5 * MIN);
  await expect(page.getByText("DESCANSO", { exact: true })).toBeVisible();
  await expect(page.getByText("Sumamos 5 min a Estudiar.")).toBeVisible();
  await shot(page, "03-break");

  // the break survives a reload with its time left
  await page.reload();
  await expect(page.getByText("DESCANSO", { exact: true })).toBeVisible();
  // the fake clock keeps running after a reload: some seconds of the minute may have passed
  await expect(page.getByRole("timer")).toHaveText(/^(01:00|00:[0-5]\d)$/);

  await page.clock.runFor(MIN);
  await expect(page.getByRole("button", { name: "Siguiente ronda" })).toBeVisible();
  await expect(page.getByText("Descanso terminado.")).toBeVisible();
  await shot(page, "04-ready");

  await page.getByRole("button", { name: "Siguiente ronda" }).click();
  await expect(page.getByText("FOCO · RONDA 2 DE 2", { exact: true })).toBeVisible();
  await page.clock.runFor(2.5 * MIN);
  await page.getByRole("button", { name: "Terminar ahora" }).click();
  await expect(page.getByText("2 pomodoros · 7 min")).toBeVisible();
  await expect(page.getByText("Hoy: 7 min · Álgebra")).toBeVisible();
  await shot(page, "05-done");

  // the minutes reached the server
  await page.goto(`/habitos/${id}/tiempo`);
  await expect(page.getByText("7 min", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Qué estudiaste")).toHaveValue("Álgebra");
});

test("a block whose first answer is lost is credited once", async ({ page }) => {
  test.setTimeout(180_000);
  const id = await studyHabit(page, "pdup");
  await page.clock.install();

  // the server gets the first request and credits it, but the browser never sees the answer
  let posts = 0;
  await page.route(`**/habitos/${id}/pomodoro`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts += 1;
    if (posts === 1) {
      await route.fetch();
      return route.abort("failed");
    }
    return route.continue();
  });

  await page.goto(`/habitos/${id}/pomodoro`);
  await page.getByRole("button", { name: "Personalizado" }).click();
  await page.getByLabel("Foco (min)").fill("5");
  await page.getByText("Sin límite", { exact: true }).click();
  await page.getByRole("button", { name: "Empezar foco" }).click();
  await page.clock.runFor(5 * MIN);
  await expect(page.getByText("DESCANSO", { exact: true })).toBeVisible();
  await expect.poll(() => posts).toBe(1);

  // back online: the retry is answered "already received" and counts as success
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => posts).toBe(2);
  await page.getByRole("button", { name: "Terminar", exact: true }).click();
  await expect(page.getByText("1 pomodoro · 5 min")).toBeVisible();
  await expect(page.getByText("Hoy: 5 min")).toBeVisible();

  await page.goto(`/habitos/${id}/tiempo`);
  await expect(page.getByText("5 min", { exact: true })).toBeVisible();
});

test("a block that ended on an earlier day is never added to today", async ({ page }) => {
  test.setTimeout(180_000);
  const id = await studyHabit(page, "pday");
  await page.clock.install();
  await page.goto(`/habitos/${id}/pomodoro`);
  await page.getByRole("button", { name: "Personalizado" }).click();
  await page.getByLabel("Foco (min)").fill("5");
  await page.getByText("Sin límite", { exact: true }).click();
  await page.getByRole("button", { name: "Empezar foco" }).click();
  await expect(page.getByRole("timer")).toHaveText("05:00");

  // the laptop sleeps through the end of the focus and the night: 26 h later, another local day
  await page.clock.fastForward(26 * 60 * MIN);
  await expect(page.getByText("Un bloque terminó ayer y ya no se puede sumar.")).toBeVisible();

  await page.goto(`/habitos/${id}/tiempo`);
  await expect(page.getByRole("heading", { name: "Tiempo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Borrar registro" })).toHaveCount(0);
});

test("the time page edits and deletes the day", async ({ page }) => {
  test.setTimeout(120_000);
  const id = await studyHabit(page, "ptime");
  // junk dates fall back to today
  await page.goto(`/habitos/${id}/tiempo?fecha=basura`);
  await expect(page.getByRole("heading", { name: "Tiempo" })).toBeVisible();

  await page.getByRole("button", { name: "30 min" }).click();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Tiempo guardado")).toBeVisible();
  await expect(page.getByRole("button", { name: "Borrar registro" })).toBeVisible();

  await page.getByLabel("Horas").fill("1");
  await page.getByLabel("Minutos").fill("25");
  await page.getByLabel("Qué estudiaste").fill("Álgebra");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Tiempo guardado")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Horas")).toHaveValue("1");
  await expect(page.getByLabel("Minutos")).toHaveValue("25");
  await expect(page.getByLabel("Qué estudiaste")).toHaveValue("Álgebra");
  await shot(page, "06-time");

  await page.getByRole("button", { name: "Borrar registro" }).click();
  await expect(page.getByText("Se borrará el tiempo de este día. Tu check-in no cambia.")).toBeVisible();
  await page.getByRole("button", { name: "Borrar", exact: true }).click();
  await expect(page.getByText("Sin registro de tiempo")).toBeVisible();

  // invalid time never reaches the server
  await page.getByRole("button", { name: "Añadir tiempo" }).click();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("El tiempo va de 1 minuto a 24 horas.")).toBeVisible();
});

test("non-time and unknown habits are 404; 375 px fits; reduced motion keeps cats still", async ({ page }) => {
  test.setTimeout(120_000);
  const id = await studyHabit(page, "pfit");
  await createPresetHabit(page, "Leer");
  const water = (await page.getByRole("link", { name: /Leer/ }).first().getAttribute("href"))?.match(/\/habitos\/([0-9a-f-]{36})/)?.[1];
  expect(water).toBeTruthy();
  for (const path of ["pomodoro", "tiempo"]) {
    const res = await page.goto(`/habitos/${water}/${path}`);
    expect(res?.status(), `${path} of a non-time habit`).toBe(404);
    const missing = await page.goto(`/habitos/00000000-0000-4000-8000-000000000000/${path}`);
    expect(missing?.status()).toBe(404);
  }

  await expectNoHorizontalScroll(page, [`/habitos/${id}/pomodoro`, `/habitos/${id}/tiempo`]);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/habitos/${id}/pomodoro`);
  await page.getByRole("button", { name: "Empezar foco" }).click();
  const cat = page.locator('[data-cat="code"]');
  await expect(cat).toBeVisible();
  const mask = await cat.evaluate((el) => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage);
  expect(mask).toContain("still");
});
