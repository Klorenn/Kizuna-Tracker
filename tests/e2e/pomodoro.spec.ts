import { expect, test, type Page } from "@playwright/test";
import { createPresetHabit, expectNoHorizontalScroll, randomHandle, signUp, expectNotFound } from "./helpers";

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
  await expect(page.getByRole("heading", { name: "Medir tiempo · Estudiar" })).toBeVisible();
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

test("a block that ended on an earlier day is never added to today (the server decides)", async ({ page }) => {
  test.setTimeout(180_000);
  const id = await studyHabit(page, "pday");
  await page.goto(`/habitos/${id}/pomodoro`);
  await page.getByRole("button", { name: "Personalizado" }).click();
  await page.getByLabel("Foco (min)").fill("5");
  await page.getByText("Sin límite", { exact: true }).click();
  await page.getByRole("button", { name: "Empezar foco" }).click();
  await expect(page.getByRole("timer")).toBeVisible();

  // a finished block of 30 hours ago sits in the stored state (a laptop that slept through the night):
  // it is sent once and the SERVER refuses it, because it ended on an earlier local day
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /kizuna:user:[^:]+:kizuna:pomodoro:[0-9a-f-]{36}$/.test(k))!;
    const s = JSON.parse(localStorage.getItem(key)!);
    s.phase = "done";
    s.pausedAt = null;
    s.pending = [{ blockId: crypto.randomUUID(), minutes: 5, endedAt: Date.now() - 30 * 3600_000 }];
    s.rev += 5000;
    localStorage.setItem(key, JSON.stringify(s));
  });
  await page.reload();
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
  // the first save's toast may still be on screen: wait for the second save itself before reloading
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(`/habitos/${id}/tiempo`));
  await page.getByRole("button", { name: "Guardar" }).click();
  await saved;
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
    await expectNotFound(page, `/habitos/${water}/${path}`, `${path} of a non-time habit`);
    await expectNotFound(page, `/habitos/00000000-0000-4000-8000-000000000000/${path}`);
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

// ---------------------------------------------------------------- Task 30: timer and stopwatch

const mode = (page: Page, name: "Pomodoro" | "Temporizador" | "Cronómetro") => page.getByRole("radio", { name });
/** The readout as seconds ("1:05:09" -> 3909). */
const seconds = async (page: Page) =>
  (await page.getByRole("timer").innerText()).split(":").reduce((acc, p) => acc * 60 + Number(p), 0);

test("a timer of 15 minutes counts down, survives a reload and credits 15 minutes", async ({ page }) => {
  test.setTimeout(180_000);
  const id = await studyHabit(page, "ptim");
  await page.clock.install();
  await page.goto(`/habitos/${id}/pomodoro`);
  await mode(page, "Temporizador").click();
  await page.getByRole("button", { name: "15 minutos" }).click();
  await expect(page.getByRole("timer")).toHaveText("15:00");
  await shot(page, "10-timer-idle");
  await page.getByLabel("Qué estudiaste").fill("Álgebra");
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await expect(page.getByRole("timer")).toHaveText("15:00");
  await shot(page, "11-timer-running");

  // the mode cannot change while it runs
  await expect(mode(page, "Cronómetro")).toHaveAttribute("aria-disabled", "true");
  await mode(page, "Cronómetro").click({ force: true });
  await expect(mode(page, "Temporizador")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Termina la sesión para cambiar de modo.")).toBeVisible();

  await page.clock.runFor(5 * MIN);
  await page.reload();
  await expect.poll(() => seconds(page)).toBeGreaterThan(9 * 60 + 40);
  await expect.poll(() => seconds(page)).toBeLessThanOrEqual(10 * 60);

  await page.clock.runFor(11 * MIN);
  await expect(page.getByText("TERMINADO", { exact: true })).toBeVisible();
  await expect(page.getByText("Sumamos 15 min a Estudiar.")).toBeVisible();
  await expect(page.getByText("Hoy: 15 min · Álgebra")).toBeVisible();
  await shot(page, "12-timer-done");
  await page.goto(`/habitos/${id}/tiempo`);
  await expect(page.locator("p").filter({ hasText: /^15 min$/ })).toBeVisible();
});

test("a stopwatch stopped at 3 min 20 s credits 3 minutes; under a minute credits nothing", async ({ page }) => {
  test.setTimeout(180_000);
  const id = await studyHabit(page, "psw");
  await page.clock.install();
  await page.goto(`/habitos/${id}/pomodoro`);
  await mode(page, "Cronómetro").click();
  await expect(page.getByRole("timer")).toHaveText("00:00");
  await shot(page, "13-stopwatch-idle");

  // under a minute: nothing to add
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await page.clock.runFor(30_000);
  await page.getByRole("button", { name: "Terminar", exact: true }).click();
  await expect(page.getByText("Menos de un minuto no se suma.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Empezar", exact: true })).toBeVisible();

  // pin the page clock so the elapsed time is exactly 3 min 20 s
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await page.clock.runFor(2 * MIN + 15_000);
  await shot(page, "14-stopwatch-running");
  await page.getByRole("button", { name: "Pausar" }).click();
  await expect(page.getByText("En pausa.")).toBeVisible();
  await page.clock.runFor(10 * MIN); // paused time never counts
  await page.getByRole("button", { name: "Reanudar" }).click();
  await page.clock.runFor(5_000);
  await expect(page.getByRole("timer")).toHaveText("02:20");
  await page.clock.runFor(60_000);
  await expect(page.getByRole("timer")).toHaveText("03:20");
  await page.getByRole("button", { name: "Terminar", exact: true }).click();
  await expect(page.getByText("Sumamos 3 min a Estudiar.", { exact: true })).toBeVisible();
  await page.clock.resume(); // a frozen page clock would also freeze the next page's hydration
  await page.goto(`/habitos/${id}/tiempo`);
  await expect(page.locator("p").filter({ hasText: /^3 min$/ })).toBeVisible();
});

test("a stopwatch closes a 90-minute block by itself and keeps counting past an hour", async ({ page }) => {
  test.setTimeout(240_000);
  const id = await studyHabit(page, "pchunk");
  await page.clock.install();
  await page.goto(`/habitos/${id}/pomodoro`);
  await mode(page, "Cronómetro").click();
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await page.clock.runFor(65 * MIN + 9_000);
  await expect.poll(() => page.getByRole("timer").innerText()).toMatch(/^1:05:\d\d$/);
  await page.reload(); // the count survives a reload
  await expect.poll(() => seconds(page)).toBeGreaterThanOrEqual(65 * 60 + 9);
  await expect.poll(() => seconds(page)).toBeLessThan(67 * 60);
  await page.clock.runFor(26 * MIN);
  await expect(page.getByText("Sumamos 90 min a Estudiar.")).toBeVisible();
  await shot(page, "15-stopwatch-chunk");
  await expect(page.getByRole("timer")).toHaveText(/^1:3[01]:\d\d$/);
  await page.getByRole("button", { name: "Terminar", exact: true }).click();
  await expect(page.getByText(/^Sumamos 9[12] min a Estudiar\.$/)).toBeVisible();
});

test("the mode switch moves with the arrow keys and Hoy opens the last mode used", async ({ page }) => {
  test.setTimeout(120_000);
  const id = await studyHabit(page, "pmode");
  await page.goto(`/habitos/${id}/pomodoro`);
  await expect(mode(page, "Pomodoro")).toHaveAttribute("aria-checked", "true");
  await mode(page, "Pomodoro").focus();
  await page.keyboard.press("ArrowRight");
  await expect(mode(page, "Temporizador")).toHaveAttribute("aria-checked", "true");
  await expect(mode(page, "Temporizador")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(mode(page, "Cronómetro")).toHaveAttribute("aria-checked", "true");

  await page.goto("/");
  const open = page.getByRole("link", { name: "Medir tiempo de Estudiar" });
  await expect(open).toHaveText("Medir");
  await shot(page, "17-hoy-medir");
  await open.click();
  await expect(mode(page, "Cronómetro")).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(mode(page, "Cronómetro")).toHaveAttribute("aria-checked", "true");
});

test("Hoy shows a running timer and links back to the screen", async ({ page }) => {
  test.setTimeout(120_000);
  const id = await studyHabit(page, "pbanner");
  await page.goto(`/habitos/${id}/pomodoro`);
  await mode(page, "Temporizador").click();
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.goto("/");
  const strip = page.getByRole("link", { name: /^Temporizador · Estudiar/ });
  await expect(strip).toBeVisible();
  await expect(strip).toContainText(/\d\d:\d\d$/);
  await shot(page, "16-hoy-banner");
  await strip.click();
  await expect(page.getByRole("heading", { name: "Medir tiempo · Estudiar" })).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();
});

test("the readout never moves between modes and 375 px fits in every mode", async ({ page }) => {
  test.setTimeout(120_000);
  const id = await studyHabit(page, "pshift");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/habitos/${id}/pomodoro`);
  const fits = async () => {
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(wide).toBe(false);
  };
  await fits();
  await mode(page, "Temporizador").click();
  // page coordinates: a click may have scrolled the page, which must not count as the readout moving
  const top = async () => page.getByRole("timer").evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  const timerIdle = await top();
  await fits();
  await page.getByRole("button", { name: "Otro" }).click();
  await page.getByLabel("Minutos (1 a 90)").fill("200");
  await expect(page.getByText("Elige entre 1 y 90 minutos.")).toBeVisible();
  expect(await top()).toBe(timerIdle);
  await fits();
  await page.getByLabel("Minutos (1 a 90)").fill("12");
  await expect(page.getByRole("timer")).toHaveText("12:00");
  await mode(page, "Cronómetro").click();
  expect(await top()).toBe(timerIdle);
  await fits();
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  expect(await top()).toBe(timerIdle);
  await fits();
});
