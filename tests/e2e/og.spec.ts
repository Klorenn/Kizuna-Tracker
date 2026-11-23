import { expect, test } from "@playwright/test";

// Crawlers (WhatsApp, iMessage, X, Discord, Slack) arrive without cookies.
test.describe("social card", () => {
  test("/bienvenida emits Open Graph and Twitter tags with absolute URLs", async ({ page }) => {
    await page.goto("/bienvenida");
    const meta = (attr: "property" | "name", key: string) =>
      page.locator(`meta[${attr}="${key}"]`).first().getAttribute("content");

    expect(await meta("property", "og:title")).toBeTruthy();
    expect(await meta("property", "og:description")).toBeTruthy();
    expect(await meta("property", "og:site_name")).toBe("Kizuna Tracker");
    expect(await meta("property", "og:type")).toBe("website");
    expect(await meta("property", "og:locale")).toBe("es_CL");
    expect(await meta("name", "twitter:card")).toBe("summary_large_image");
    expect(await meta("name", "twitter:title")).toBeTruthy();

    for (const [attr, key] of [
      ["property", "og:image"],
      ["name", "twitter:image"],
    ] as const) {
      const value = await meta(attr, key);
      expect(value, key).toMatch(/^https?:\/\/.+\/(opengraph|twitter)-image\.png/);
    }
    expect(await meta("property", "og:image:width")).toBe("1200");
    expect(await meta("property", "og:image:height")).toBe("630");
    expect(await meta("property", "og:image:alt")).toBeTruthy();
  });

  for (const route of ["/opengraph-image.png", "/twitter-image.png"]) {
    test(`${route} answers 200 image/png to an anonymous request`, async ({ playwright, baseURL }) => {
      const anon = await playwright.request.newContext({ baseURL });
      const res = await anon.get(route, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("image/png");
      expect((await res.body()).length).toBeGreaterThan(10_000);
      await anon.dispose();
    });
  }
});
