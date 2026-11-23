import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { logIn, PASSWORD, randomHandle } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase seeded with supabase/seed.sql (E2E_SUPABASE=1)");

const preset = (n: number) => `/avatars/preset-${n}.webp`;
const presetImg = (page: Page, n: number) => page.locator(`main img[src$="${preset(n)}"]`).first();

/** Steps 1-2 of the signup, then username on step 3 (waits for availability). */
async function signupUntilStep3(page: Page, handle: string) {
  await page.goto("/registro");
  await page.getByLabel("Nombre").fill("Carolina");
  await page.getByLabel("Apellido").fill("E2E");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Día").fill("14");
  await page.getByLabel("Mes").fill("03");
  await page.getByLabel("Año").fill("1998");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Usuario").fill(handle);
  await expect(page.getByText(`@${handle} está disponible`)).toBeVisible();
}

async function finishSignup(page: Page, handle: string) {
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Correo", { exact: true }).fill(`${handle}@example.com`);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmar contraseña").fill(PASSWORD);
  await page.getByText("Acepto los términos y la privacidad").click();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/listo$/);
}

test("signup step 3: random preselection that survives back/forward, pick avatar 3, preview, Listo and Perfil", async ({ page }) => {
  const handle = randomHandle("ava");
  await signupUntilStep3(page, handle);

  const group = page.getByRole("radiogroup", { name: "Elige tu avatar" });
  await expect(group.getByRole("radio")).toHaveCount(8);
  await expect(group.getByRole("radio", { checked: true })).toHaveCount(1);

  // the random preselection is stable when going back and forward
  const before = await group.getByRole("radio", { checked: true }).getAttribute("aria-label");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Atrás" }).click();
  await page.getByLabel("Usuario").fill(handle);
  await expect(page.getByText(`@${handle} está disponible`)).toBeVisible();
  await expect(group.getByRole("radio", { checked: true })).toHaveAttribute("aria-label", before!);

  // tapping picks, the arrow keys move the selection, and the preview follows
  await group.getByRole("radio", { name: "Avatar 3" }).click();
  await expect(group.getByRole("radio", { name: "Avatar 3" })).toHaveAttribute("aria-checked", "true");
  const preview = page.locator("div", { has: page.getByText("Así te verán tus amigos") }).last();
  await expect(preview.locator(`img[src$="${preset(3)}"]`)).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(group.getByRole("radio", { name: "Avatar 4" })).toHaveAttribute("aria-checked", "true");
  await expect(preview.locator(`img[src$="${preset(4)}"]`)).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(group.getByRole("radio", { name: "Avatar 3" })).toHaveAttribute("aria-checked", "true");

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await finishSignup(page, handle);
  await expect(page.getByRole("heading", { name: `Listo, @${handle}` })).toBeVisible();
  await expect(presetImg(page, 3)).toBeVisible();

  await page.getByRole("link", { name: "Empezar" }).click();
  await page.goto("/perfil");
  await expect(presetImg(page, 3)).toBeVisible();
});

test("Ajustes: change the preset in the photo sheet, it persists after reload", async ({ page }) => {
  const handle = randomHandle("avb");
  await signupUntilStep3(page, handle);
  await page.getByRole("radio", { name: "Avatar 2" }).click();
  await finishSignup(page, handle);
  await page.goto("/perfil/ajustes");

  await page.getByRole("button", { name: /Foto de perfil/ }).click();
  const sheet = page.getByRole("dialog", { name: "Foto de perfil" });
  await expect(sheet.getByRole("button", { name: "Subir foto" })).toBeVisible();
  await expect(sheet.getByRole("radio")).toHaveCount(8);
  await expect(sheet.getByRole("radio", { name: "Avatar 2" })).toHaveAttribute("aria-checked", "true");
  // no uploaded photo: nothing to remove
  await expect(sheet.getByRole("button", { name: "Quitar foto" })).toHaveCount(0);

  await sheet.getByRole("radio", { name: "Avatar 6" }).click();
  await expect(sheet.getByRole("radio", { name: "Avatar 6" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Avatar actualizado")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /Foto de perfil/ }).click();
  await expect(page.getByRole("dialog", { name: "Foto de perfil" }).getByRole("radio", { name: "Avatar 6" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.goto("/perfil");
  await expect(presetImg(page, 6)).toBeVisible();
});

test("Ajustes: with a photo, a cat keeps the photo (hint); only Quitar foto, confirmed, deletes it", async ({ page }) => {
  const handle = randomHandle("avp");
  await signupUntilStep3(page, handle);
  await page.getByRole("radio", { name: "Avatar 2" }).click();
  await finishSignup(page, handle);
  await page.goto("/perfil/ajustes");
  const jpeg = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 96;
    c.height = 96;
    const g = c.getContext("2d")!;
    g.fillStyle = "#2e3a5e";
    g.fillRect(0, 0, 96, 96);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });

  await page.getByRole("button", { name: /Foto de perfil/ }).click();
  const sheet = page.getByRole("dialog", { name: "Foto de perfil" });
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: "yo.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(jpeg, "base64"),
  });
  // a successful upload closes the sheet; reopen it
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('img[src*="/storage/v1/object/public/avatars/"]').first()).toBeVisible();
  await page.getByRole("button", { name: /Foto de perfil/ }).click();
  await expect(sheet.getByRole("button", { name: "Quitar foto" })).toBeVisible();
  const hint = "Tu foto sigue visible. Toca 'Quitar foto' para mostrar el gatito.";
  await expect(sheet.getByText(hint)).toBeVisible();

  // a cat is saved as the fallback; the photo stays
  await sheet.getByRole("radio", { name: "Avatar 5" }).click();
  await expect(page.getByText("Avatar actualizado")).toBeVisible();
  await expect(sheet.getByRole("radio", { name: "Avatar 5" })).toHaveAttribute("aria-checked", "true");
  await expect(sheet.getByRole("button", { name: "Quitar foto" })).toBeVisible();
  await page.reload();
  await page.goto("/perfil");
  await expect(page.locator('main img[src*="/storage/v1/object/public/avatars/"]').first()).toBeVisible();
  await expect(presetImg(page, 5)).toHaveCount(0);

  // Quitar foto asks first; cancel keeps it, confirm deletes it and the cat shows
  await page.goto("/perfil/ajustes");
  await page.getByRole("button", { name: /Foto de perfil/ }).click();
  await sheet.getByRole("button", { name: "Quitar foto" }).click();
  const confirm = page.getByRole("dialog", { name: "¿Quitar tu foto?" });
  await expect(confirm).toHaveAccessibleDescription("Se borra la foto que subiste y vuelve a verse tu gatito.");
  await confirm.getByRole("button", { name: "Cancelar" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Quitar foto" })).toBeVisible();
  await sheet.getByRole("button", { name: "Quitar foto" }).click();
  await confirm.getByRole("button", { name: "Quitar foto" }).click();
  await expect(page.getByText("Foto quitada")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Quitar foto" })).toHaveCount(0);
  await expect(sheet.getByText(hint)).toHaveCount(0);
  await page.goto("/perfil");
  await expect(presetImg(page, 5)).toBeVisible();
});

test("a friend sees the preset: Amigos list, feed and friend profile (own users, then a change)", async ({ page }) => {
  // own users (service role: test setup only), so the shared seed is never written
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const mk = async (prefix: string, first: string) => {
    const handle = randomHandle(prefix);
    const { data, error } = await admin.auth.admin.createUser({
      email: `${handle}@example.com`,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        username: handle,
        first_name: first,
        last_name: "E2E",
        birth_date: "1995-05-05",
        timezone: "America/Santiago",
        terms_accepted: true,
      },
    });
    expect(error).toBeNull();
    return { id: data.user!.id, handle };
  };
  const ana = await mk("avana", "Ana");
  const beto = await mk("avbeto", "Beto");
  expect((await admin.from("friendships").insert({ requester_id: ana.id, addressee_id: beto.id, status: "accepted" })).error).toBeNull();
  expect((await admin.from("profiles").update({ avatar_preset: 7 }).eq("id", beto.id)).error).toBeNull();
  // Beto has something to show in the feed
  const habit = await admin
    .from("habits")
    .insert({ user_id: beto.id, name: "Leer", icon: "book", frequency_type: "daily", color: "arena", visibility: "friends" })
    .select("id")
    .single();
  expect(habit.error).toBeNull();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  expect((await admin.from("checkins").insert({ habit_id: habit.data!.id, user_id: beto.id, local_date: today })).error).toBeNull();

  await logIn(page, ana.handle, PASSWORD);
  await page.goto("/amigos");
  const betoRow = page.getByRole("region", { name: "Tus amigos" }).getByRole("link", { name: /Beto E2E/ });
  await expect(betoRow.locator(`img[src$="${preset(7)}"]`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Actividad" }).locator(`img[src$="${preset(7)}"]`).first()).toBeVisible();
  await betoRow.click();
  await expect(presetImg(page, 7)).toBeVisible();

  // Beto changes it (service role stands in for his Ajustes; the UI path is covered above)
  expect((await admin.from("profiles").update({ avatar_preset: 4 }).eq("id", beto.id)).error).toBeNull();
  await page.reload();
  await expect(presetImg(page, 4)).toBeVisible();
});

test("public profile of a seeded user shows its preset to a visitor", async ({ page }) => {
  await page.goto("/@user_a");
  await expect(page.getByRole("heading", { name: "Ana Prueba" })).toBeVisible();
  await expect(presetImg(page, 1)).toBeVisible();
});
