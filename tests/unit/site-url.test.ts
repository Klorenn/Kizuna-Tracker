import { afterEach, describe, expect, it, vi } from "vitest";
import { siteOrigin } from "@/lib/site-url";

const headers = (init: Record<string, string> = {}) => new Headers(init);

describe("siteOrigin", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the configured origin and strips trailing slashes", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://kizuna.example.com//");
    expect(siteOrigin(headers())).toBe("https://kizuna.example.com");
  });

  it("adds https to a scheme-less configured value", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "kizuna.example.com");
    expect(siteOrigin(headers())).toBe("https://kizuna.example.com");
  });

  it("derives the origin from the request headers when nothing is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(siteOrigin(headers({ "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https" }))).toBe(
      "https://app.example.com",
    );
    expect(siteOrigin(headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
  });
});
