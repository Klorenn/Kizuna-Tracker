import { expect, test, type APIResponse } from "@playwright/test";

const FIVE: [string, string][] = [
  ["x-frame-options", "DENY"],
  ["content-security-policy", "frame-ancestors 'none'"],
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["permissions-policy", "camera=(self), microphone=(), geolocation=(), payment=(), usb=()"],
];

function expectFive(res: APIResponse) {
  for (const [k, v] of FIVE) expect(res.headers()[k], k).toBe(v);
}

for (const path of ["/bienvenida", "/login", "/api/health"]) {
  test(`${path} carries the security headers`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expectFive(res);
  });
}

test("/amigos without a session redirects to /login with the headers", async ({ request }) => {
  const res = await request.get("/amigos", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(new URL(res.headers()["location"], "http://localhost").pathname).toBe("/login");
  expectFive(res);
});

test("POST /api/cron/reminders without a secret is 401 with the headers", async ({ request }) => {
  const res = await request.post("/api/cron/reminders");
  expect(res.status()).toBe(401);
  expectFive(res);
});

test("static brand art carries the headers and its cache header", async ({ request }) => {
  const res = await request.get("/brand/cat-code-still.png");
  expect(res.status()).toBe(200);
  expectFive(res);
  expect(res.headers()["cache-control"]).toBe("public, max-age=604800, stale-while-revalidate=2592000");
});

test("/robots.txt is public plain text with the three lines", async ({ request }) => {
  const res = await request.get("/robots.txt", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/plain");
  expectFive(res);
  const lines = (await res.text()).split("\n").map((l) => l.trim()).filter(Boolean);
  expect(lines).toEqual(["User-Agent: *", "Allow: /bienvenida", "Disallow: /"]);
});

test("/registro has its own tab title", async ({ page }) => {
  await page.goto("/registro");
  await expect(page).toHaveTitle("Crear cuenta · Kizuna");
});
