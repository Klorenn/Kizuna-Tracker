import { afterEach, describe, expect, it, vi } from "vitest";
import { supabasePublicConfig } from "@/lib/supabase/env";
import { configPresence, supabaseServiceKey } from "@/lib/supabase/env.server";

vi.mock("server-only", () => ({}));

const NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
];

function setEnv(env: Record<string, string>) {
  for (const n of NAMES) vi.stubEnv(n, "");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
}

afterEach(() => vi.unstubAllEnvs());

describe("supabasePublicConfig", () => {
  it("is null with nothing set", () => {
    setEnv({});
    expect(supabasePublicConfig()).toBeNull();
  });
  it("reads the classic names", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://a", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k1" });
    expect(supabasePublicConfig()).toEqual({ url: "https://a", key: "k1" });
  });
  it("url precedence: NEXT_PUBLIC_ over SUPABASE_URL", () => {
    setEnv({ SUPABASE_URL: "https://b", NEXT_PUBLIC_SUPABASE_URL: "https://a", SUPABASE_ANON_KEY: "k" });
    expect(supabasePublicConfig()?.url).toBe("https://a");
  });
  it("falls back to SUPABASE_URL", () => {
    setEnv({ SUPABASE_URL: "https://b", SUPABASE_ANON_KEY: "k" });
    expect(supabasePublicConfig()).toEqual({ url: "https://b", key: "k" });
  });
  it("key precedence: anon, public publishable, SUPABASE_ANON, SUPABASE_PUBLISHABLE", () => {
    const url = "https://a";
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "k1",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k2",
      SUPABASE_ANON_KEY: "k3",
      SUPABASE_PUBLISHABLE_KEY: "k4",
    });
    expect(supabasePublicConfig()?.key).toBe("k1");
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k2",
      SUPABASE_ANON_KEY: "k3",
      SUPABASE_PUBLISHABLE_KEY: "k4",
    });
    expect(supabasePublicConfig()?.key).toBe("k2");
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_ANON_KEY: "k3", SUPABASE_PUBLISHABLE_KEY: "k4" });
    expect(supabasePublicConfig()?.key).toBe("k3");
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: "k4" });
    expect(supabasePublicConfig()?.key).toBe("k4");
  });
  it("blank and whitespace-only values count as missing", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "   ",
      SUPABASE_URL: "https://b",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "\t",
      SUPABASE_PUBLISHABLE_KEY: "k",
    });
    expect(supabasePublicConfig()).toEqual({ url: "https://b", key: "k" });
  });
  it("is null when only one part exists", () => {
    setEnv({ SUPABASE_URL: "https://b" });
    expect(supabasePublicConfig()).toBeNull();
    setEnv({ SUPABASE_ANON_KEY: "k" });
    expect(supabasePublicConfig()).toBeNull();
  });
});

describe("supabaseServiceKey", () => {
  it("prefers SERVICE_ROLE_KEY, then SECRET_KEY, else null", () => {
    setEnv({ SUPABASE_SECRET_KEY: "s2", SUPABASE_SERVICE_ROLE_KEY: "s1" });
    expect(supabaseServiceKey()).toBe("s1");
    setEnv({ SUPABASE_SECRET_KEY: "s2" });
    expect(supabaseServiceKey()).toBe("s2");
    setEnv({ SUPABASE_SERVICE_ROLE_KEY: "  " });
    expect(supabaseServiceKey()).toBeNull();
  });
});

describe("configPresence", () => {
  it("reports booleans only", () => {
    setEnv({ SUPABASE_URL: "https://secret-host", SUPABASE_PUBLISHABLE_KEY: "pk", SUPABASE_SECRET_KEY: "sk" });
    const p = configPresence();
    expect(p).toEqual({ url: true, publicKey: true, serviceKey: true });
    expect(JSON.stringify(p)).not.toContain("secret-host");
  });
  it("reports missing parts", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://a" });
    expect(configPresence()).toEqual({ url: true, publicKey: false, serviceKey: false });
  });
});
