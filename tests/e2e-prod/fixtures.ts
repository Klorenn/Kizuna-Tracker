import { test as base, expect } from "@playwright/test";

/** Known third-party / environment noise that must not fail the suite. */
const ALLOWED = [/vercel[-.]?(insights|analytics|live|scripts)/i, /_vercel\//i, /google(tagmanager|-analytics|apis)/i];

/**
 * Every test collects uncaught page errors and console errors, and fails on any that is not allowlisted.
 * Console errors raised by resources of another origin (blocked ads, third-party 4xx) are ignored.
 */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page, baseURL }, use) => {
      const errors: string[] = [];
      const origin = baseURL ? new URL(baseURL).origin : "";
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        const url = m.location().url;
        if (url && origin && !url.startsWith(origin)) return;
        errors.push(`console.error: ${m.text()} ${url}`.trim());
      });
      await use(errors);
      const real = errors.filter((e) => !ALLOWED.some((re) => re.test(e)));
      expect(real, "uncaught page errors / console errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
