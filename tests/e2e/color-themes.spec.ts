import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, randomHandle, signUp } from "./helpers";

// Computed colours of the light theme (#rrggbb in tokens.css as rgb()): the accent of each colour,
// and the indigo cat. Written out here on purpose: the test pins what the person sees.
const INDIGO = "rgb(90, 90, 194)";
const SAKURA = "rgb(185, 63, 120)";
const MATCHA = "rgb(58, 122, 75)";
const KON = "rgb(35, 64, 122)";
const CAT_LIGHT = "rgb(90, 90, 194)";
const CAT_DARK = "rgb(140, 140, 240)";

const expectCookie = (context: BrowserContext, value: string) =>
  expect.poll(async () => (await context.cookies()).find((c) => c.name === "color")?.value).toBe(value);
const dataColor = (page: Page) => page.locator("html").getAttribute("data-color");
const bg = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor);

test.describe("color cookie, no session", () => {
  test("login honours the cookie, anything else is indigo", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "color", value: "sakura", url: baseURL! }]);
    await page.goto("/login");
    expect(await dataColor(page)).toBe("sakura");

    await context.addCookies([{ name: "color", value: "rojo", url: baseURL! }]);
    await page.goto("/login");
    expect(await dataColor(page)).toBe("indigo");
  });

  test("the cat keeps indigo under another colour, in light and in dark", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "color", value: "sakura", url: baseURL! }]);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/bienvenida");
    expect(await dataColor(page)).toBe("sakura");
    await expect(page.locator("[data-cat]").first()).toBeAttached();
    expect(await bg(page, "[data-cat]")).toBe(CAT_LIGHT);

    await page.emulateMedia({ colorScheme: "dark" }); // theme is "system" without a cookie
    expect(await bg(page, "[data-cat]")).toBe(CAT_DARK);
  });
});

test.describe("Ajustes > Color", () => {
  test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase seeded with supabase/seed.sql (E2E_SUPABASE=1)");

  test("choose, persist, restore; keyboard; no layout shift; 375 px", async ({ page, context }) => {
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await signUp(page, randomHandle("color"), "Colorina");
    await page.goto("/perfil/ajustes");

    const group = page.getByRole("radiogroup", { name: "Color" });
    await expect(group).toBeVisible();
    await expect(group.getByRole("radio")).toHaveCount(17);
    for (const name of ["Índigo", "Sakura, rosa", "Matcha, verde", "Yuzu, ámbar", "Umi, turquesa", "Ume, ciruela", "Sumi, grafito", "Sora, azul", "Kon, azul marino", "Fuji, lavanda", "Budō, uva", "Mori, bosque", "Wakaba, lima", "Kin, oliva dorado", "Cha, café", "Nezu, pizarra", "Suna, arena"]) {
      const radio = group.getByRole("radio", { name, exact: true });
      await expect(radio).toBeVisible();
      const box = (await radio.boundingBox())!;
      expect(box.width, `${name} width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${name} height`).toBeGreaterThanOrEqual(44);
    }
    expect(await dataColor(page)).toBe("indigo");
    await expect(group.getByRole("radio", { name: "Índigo", exact: true })).toBeChecked();
    // at 375 px the seventeen swatches wrap in a grid of six per row (6 + 6 + 5)
    await page.setViewportSize({ width: 375, height: 812 });
    const ys = await group.getByRole("radio").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    const perRow = [...new Set(ys)].map((y) => ys.filter((v) => v === y).length);
    expect(perRow).toEqual([6, 6, 5]);
    await page.setViewportSize({ width: 390, height: 844 });

    // each swatch paints its own colour, scoped by data-color (no hex in the component)
    expect(await bg(page, 'button[data-color-option="matcha"] [data-color]')).toBe(MATCHA);
    expect(await bg(page, 'button[data-color-option="sakura"] [data-color]')).toBe(SAKURA);

    const row = group.locator("xpath=..");
    const before = (await row.boundingBox())!;

    await group.getByRole("radio", { name: "Sakura, rosa", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-color", "sakura");
    await expect(group.getByRole("radio", { name: "Sakura, rosa", exact: true })).toBeChecked();
    await expect(row.getByText("Sakura", { exact: true })).toBeVisible();
    const after = (await row.boundingBox())!;
    expect(after.height).toBe(before.height); // no layout shift
    expect(after.y).toBe(before.y);

    // survives a reload and a brand new page of the same browser
    await expectCookie(context, "sakura"); // the action is optimistic: wait until the server stored it
    await page.reload();
    expect(await dataColor(page)).toBe("sakura");
    const other = await context.newPage();
    await other.emulateMedia({ colorScheme: "light" });
    await other.goto("/perfil/ajustes");
    expect(await dataColor(other)).toBe("sakura");
    await other.close();

    // a primary button follows the accent; the cat does not
    await page.goto("/habitos/nuevo");
    await page.getByRole("button", { name: "Agua", exact: true }).click();
    await expect(page.getByLabel("Nombre")).toHaveValue("Agua");
    const create = page.getByRole("button", { name: "Crear hábito" });
    await expect(create).toBeEnabled();
    expect(await create.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(SAKURA);

    // back to Índigo restores today's accent
    await page.goto("/perfil/ajustes");
    await group.getByRole("radio", { name: "Índigo", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-color", "indigo");
    await expectCookie(context, "indigo");
    await page.goto("/habitos/nuevo");
    await page.getByRole("button", { name: "Agua", exact: true }).click();
    expect(await page.getByRole("button", { name: "Crear hábito" }).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(INDIGO);

    // arrow keys move the selection (radio group keyboard model) and apply it
    await page.goto("/perfil/ajustes");
    await group.getByRole("radio", { name: "Índigo", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("html")).toHaveAttribute("data-color", "sakura");
    await expect(group.getByRole("radio", { name: "Sakura, rosa", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("html")).toHaveAttribute("data-color", "suna"); // wraps around
    await page.keyboard.press("Home");
    await expect(page.locator("html")).toHaveAttribute("data-color", "indigo");
    await page.keyboard.press("ArrowDown"); // one row down (six per row)
    await expect(page.locator("html")).toHaveAttribute("data-color", "sumi");
    await page.keyboard.press("End");
    await expect(page.locator("html")).toHaveAttribute("data-color", "suna");

    // a new colour end to end: Kon, azul marino
    await group.getByRole("radio", { name: "Kon, azul marino", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-color", "kon");
    await expectCookie(context, "kon");
    await page.reload();
    expect(await dataColor(page)).toBe("kon");
    await expect(group.getByRole("radio", { name: "Kon, azul marino", exact: true })).toBeChecked();
    await page.goto("/habitos/nuevo");
    await page.getByRole("button", { name: "Agua", exact: true }).click();
    expect(await page.getByRole("button", { name: "Crear hábito" }).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(KON);

    await expectNoHorizontalScroll(page, ["/perfil/ajustes"]);
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await expectNoHorizontalScroll(page, ["/perfil/ajustes"]);
  });

  test("dark mode: swatches show the dark accent and the choice still applies", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await signUp(page, randomHandle("colord"), "Colorina");
    await page.goto("/perfil/ajustes");
    const group = page.getByRole("radiogroup", { name: "Color" });
    await group.getByRole("radio", { name: "Matcha, verde", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-color", "matcha");
    expect(await bg(page, 'button[data-color-option="matcha"] [data-color]')).toBe("rgb(124, 199, 146)");
  });
});
