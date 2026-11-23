import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { logIn, PASSWORD, randomHandle } from "./helpers";

test.skip(!process.env.E2E_SUPABASE, "needs a local Supabase (E2E_SUPABASE=1)");

const TZ = "America/Santiago";

/**
 * Seeds its own users and data with the service role (test tooling only), then looks at the app
 * like each kind of viewer would: friend, third friend, stranger, pending request.
 */
async function seed() {
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
        timezone: TZ,
        terms_accepted: true,
      },
    });
    expect(error).toBeNull();
    return { id: data.user!.id, handle, first };
  };
  const [viewer, owner, third, stranger, pending] = await Promise.all([
    mk("pva", "Vera"),
    mk("pvb", "Bruno"),
    mk("pvc", "Carla"),
    mk("pvs", "Sara"),
    mk("pvp", "Paco"),
  ]);

  const friendship = async (requester: string, addressee: string, status: "accepted" | "pending") => {
    const { error } = await admin.from("friendships").insert({ requester_id: requester, addressee_id: addressee, status });
    expect(error).toBeNull();
  };
  await friendship(viewer.id, owner.id, "accepted");
  await friendship(third.id, owner.id, "accepted");
  await friendship(pending.id, owner.id, "pending");

  const habit = async (name: string, visibility: "public" | "friends" | "private") => {
    const { data, error } = await admin
      .from("habits")
      .insert({ user_id: owner.id, name, icon: "book", frequency_type: "daily", color: "arena", visibility })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data!.id as string;
  };
  const visible = await habit("Correr", "friends");
  const secret = await habit("Secreto", "private");
  const selfie = await habit("Selfie", "friends");
  const meditar = await habit("Meditar", "public");

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const checkin = async (habitId: string, extra: Record<string, unknown> = {}) => {
    const id = randomUUID();
    const { error } = await admin
      .from("checkins")
      .insert({ id, habit_id: habitId, user_id: owner.id, local_date: yesterday, ...extra });
    expect(error).toBeNull();
  };
  await checkin(visible);
  await checkin(secret);
  await checkin(meditar);
  // a photo the viewer rejected: only its owner and the viewer may see it
  const rejectedId = randomUUID();
  const { error } = await admin.from("checkins").insert({
    id: rejectedId,
    habit_id: selfie,
    user_id: owner.id,
    local_date: yesterday,
    photo_path: `${owner.id}/${rejectedId}.jpg`,
    rejected_at: new Date().toISOString(),
    rejected_by: viewer.id,
    reject_reason: "not_habit",
  });
  expect(error).toBeNull();

  return { viewer, owner, third, stranger, pending };
}

async function as(page: Page, handle: string) {
  await page.context().clearCookies();
  await logIn(page, `@${handle}`, PASSWORD);
}

test("a friend sees public habits but never the private one, in the profile or the feed", async ({ page }) => {
  const { viewer, owner } = await seed();
  await as(page, viewer.handle);

  await page.goto(`/@${owner.handle}`);
  await expect(page.getByRole("heading", { name: "Bruno E2E", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: /Progreso de Bruno/ })).toBeVisible();
  await expect(page.getByText("Correr").first()).toBeVisible();
  await expect(page.getByText("Secreto")).toHaveCount(0);

  await page.goto("/amigos");
  const activity = page.getByRole("region", { name: "Actividad" });
  await expect(activity.getByText("Completó Correr")).toBeVisible();
  await expect(activity.getByText("Secreto")).toHaveCount(0);
});

test("a rejected check-in is visible to the person who rejected it, not to a third friend", async ({ page }) => {
  const { viewer, owner, third } = await seed();

  // the rejecter sees it, labelled as theirs, in the profile and the feed
  await as(page, viewer.handle);
  await page.goto(`/@${owner.handle}`);
  await expect(page.getByText("La rechazaste").first()).toBeVisible();
  await page.goto("/amigos");
  await expect(page.getByRole("region", { name: "Actividad" }).getByText("La rechazaste").first()).toBeVisible();

  // a third friend of the owner sees neither the photo nor a "Rechazada" chip
  await as(page, third.handle);
  await page.goto(`/@${owner.handle}`);
  await expect(page.getByRole("heading", { name: "Bruno E2E", level: 1 })).toBeVisible();
  await expect(page.getByText("Completó Correr").first()).toBeVisible();
  await expect(page.getByText("Subió su foto de Selfie")).toHaveCount(0);
  await expect(page.getByText("Rechazada")).toHaveCount(0);
  await expect(page.getByText("La rechazaste")).toHaveCount(0);
  await page.goto("/amigos");
  const activity = page.getByRole("region", { name: "Actividad" });
  await expect(activity.getByText("Completó Correr")).toBeVisible();
  await expect(activity.getByText("Subió su foto de Selfie")).toHaveCount(0);
});

test("a stranger and a pending request see no friend-only data", async ({ page }) => {
  const { owner, stranger, pending } = await seed();

  for (const viewer of [stranger, pending]) {
    await as(page, viewer.handle);
    await page.goto(`/@${owner.handle}`);
    // who it is, but none of the friend view or any habit data
    await expect(page.getByRole("heading", { name: "Bruno E2E", level: 1 })).toBeVisible();
    await expect(page.getByText("Meditar", { exact: true })).toBeVisible();
    for (const hidden of ["Correr", "Secreto", "Últimos registros", "Retos entre ustedes", "Progreso de Bruno"]) {
      await expect(page.getByText(hidden)).toHaveCount(0);
    }
  }
});

test("someone who asked you for friendship with no public habits still shows Aceptar and Rechazar", async ({ page }) => {
  const { owner, pending } = await seed();
  await as(page, owner.handle);
  await page.goto(`/@${pending.handle}`);
  await expect(page.getByRole("heading", { name: "Paco E2E", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aceptar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rechazar" })).toBeVisible();
  await expect(page.getByText("Perfil no disponible")).toHaveCount(0);
});
