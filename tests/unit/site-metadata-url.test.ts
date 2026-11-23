import { describe, expect, it } from "vitest";
import { FALLBACK_SITE_URL, resolveSiteUrl } from "@/lib/site-metadata-url";

describe("resolveSiteUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL", () => {
    const url = resolveSiteUrl({
      NEXT_PUBLIC_SITE_URL: "https://kizuna.example.com",
      VERCEL_PROJECT_PRODUCTION_URL: "other.vercel.app",
    });
    expect(url.href).toBe("https://kizuna.example.com/");
  });

  it("falls back to the Vercel production host, adding https", () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "kizuna-tracker.vercel.app" }).origin).toBe(
      "https://kizuna-tracker.vercel.app",
    );
  });

  it("falls back to the hardcoded production URL", () => {
    expect(resolveSiteUrl({}).href).toBe(`${FALLBACK_SITE_URL}/`);
  });

  it("strips trailing slashes", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://kizuna.example.com///" }).href).toBe(
      "https://kizuna.example.com/",
    );
  });

  it("adds https when the protocol is missing", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "kizuna.example.com" }).origin).toBe(
      "https://kizuna.example.com",
    );
  });

  it("keeps an explicit http protocol (local dev)", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000/" }).origin).toBe(
      "http://localhost:3000",
    );
  });

  it("ignores empty and whitespace-only values", () => {
    expect(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "  ", VERCEL_PROJECT_PRODUCTION_URL: "" }).href,
    ).toBe(`${FALLBACK_SITE_URL}/`);
    expect(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "", VERCEL_PROJECT_PRODUCTION_URL: " app.vercel.app/ " }).origin,
    ).toBe("https://app.vercel.app");
  });

  it("falls back when the value is not a valid URL", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "http://" }).href).toBe(`${FALLBACK_SITE_URL}/`);
  });

  it("falls through to the Vercel value when NEXT_PUBLIC_SITE_URL is invalid", () => {
    expect(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "http://", VERCEL_PROJECT_PRODUCTION_URL: "app.vercel.app" }).origin,
    ).toBe("https://app.vercel.app");
  });

  it("keeps the origin only when the value has a path", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://x.com/app/" }).href).toBe("https://x.com/");
  });

  it("uses http for scheme-less localhost and 127.0.0.1", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "localhost:3000" }).origin).toBe("http://localhost:3000");
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "127.0.0.1:3000/" }).origin).toBe("http://127.0.0.1:3000");
  });
});
