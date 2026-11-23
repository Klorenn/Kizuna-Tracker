import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { dayLabel, monthTitle, shiftMonth } from "../../src/domain/calendar";
import { logIn, PASSWORD, randomHandle } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase (E2E_SUPABASE=1)");

const TZ = "America/Santiago";

/**
 * Seeds its own user with history in the previous month (service role: test tooling only,
 * the app itself never writes check-ins from a client), then uses the calendar like a person.
 */
test("calendario: mes anterior con el chevron, detalle de un día y teclado", async ({ page }) => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const handle = randomHandle("cal");
  const { data: created, error } = await admin.auth.admin.createUser({
    email: `${handle}@example.com`,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      username: handle,
      first_name: "Cata",
      last_name: "E2E",
      birth_date: "1995-05-05",
      timezone: TZ,
      terms_accepted: true,
    },
  });
  expect(error).toBeNull();
  const userId = created.user!.id;

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const prev = shiftMonth(today.slice(0, 7), -1);
  const doneDay = `${prev}-14`;
  const { data: habit, error: habitError } = await admin
    .from("habits")
    .insert({ user_id: userId, name: "Lectura", icon: "book", frequency_type: "daily", color: "arena" })
    .select("id")
    .single();
  expect(habitError).toBeNull();
  const { error: checkinError } = await admin
    .from("checkins")
    .insert({ habit_id: habit!.id, user_id: userId, local_date: doneDay });
  expect(checkinError).toBeNull();

  await logIn(page, `@${handle}`, PASSWORD);
  await page.goto("/resumen");
  const current = monthTitle(today.slice(0, 7));
  await expect(page.getByRole("heading", { name: `${current.name} ${current.year}` })).toBeVisible();
  // nothing after this month
  await expect(page.getByRole("button", { name: "Mes siguiente" })).toHaveAttribute("aria-disabled", "true");

  await page.getByRole("button", { name: "Mes anterior" }).click();
  await expect(page).toHaveURL(new RegExp(`mes=${prev}`));
  const previous = monthTitle(prev);
  await expect(page.getByRole("heading", { name: `${previous.name} ${previous.year}` })).toBeVisible();
  // the first check-in is in this month: no further back
  await expect(page.getByRole("button", { name: "Mes anterior" })).toHaveAttribute("aria-disabled", "true");

  const day = page.getByRole("button", { name: `${dayLabel(doneDay)}: Lectura hecho` });
  await day.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Lectura")).toBeVisible();
  await expect(sheet.getByText("Hecho")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(day).toBeFocused();

  // roving focus: the next day has no records (the habit was created later, so it is not listed)
  await page.keyboard.press("ArrowRight");
  const next = page.getByRole("button", { name: `${dayLabel(`${prev}-15`)}: sin registros` });
  await expect(next).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet.getByText("Sin registros este día")).toBeVisible();
  await page.keyboard.press("Escape");

  // reload keeps the month (it lives in the URL); "Hoy" goes back to this month
  await page.reload();
  await expect(page.getByRole("heading", { name: `${previous.name} ${previous.year}` })).toBeVisible();
  await page.getByRole("button", { name: "Hoy", exact: true }).click();
  await expect(page).toHaveURL(/\/resumen$/);
  await expect(page.getByRole("heading", { name: `${current.name} ${current.year}` })).toBeVisible();
});
