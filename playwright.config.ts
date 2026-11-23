import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

/**
 * Local Supabase keys are read from `supabase status` at runtime and handed to the dev
 * server / test workers as process env. Nothing is written to disk. Explicit env vars win,
 * so CI or an owner-provided .env.local keep working.
 */
function localSupabaseEnv(): Record<string, string> {
  const fromEnv = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (fromEnv.NEXT_PUBLIC_SUPABASE_URL && fromEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY && fromEnv.SUPABASE_SERVICE_ROLE_KEY) {
    return fromEnv as Record<string, string>;
  }
  try {
    const out = execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 20_000,
    });
    const s = JSON.parse(out.slice(out.indexOf("{"))) as Record<string, string>;
    if (!s.API_URL || !s.ANON_KEY || !s.SERVICE_ROLE_KEY) return {};
    return {
      NEXT_PUBLIC_SUPABASE_URL: fromEnv.NEXT_PUBLIC_SUPABASE_URL ?? s.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: fromEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? s.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: fromEnv.SUPABASE_SERVICE_ROLE_KEY ?? s.SERVICE_ROLE_KEY,
    };
  } catch {
    return {};
  }
}

const supabaseEnv = localSupabaseEnv();
// Specs that need a running Supabase (tests/e2e/*) skip unless this is set.
if (supabaseEnv.NEXT_PUBLIC_SUPABASE_URL && !process.env.E2E_SUPABASE) process.env.E2E_SUPABASE = "1";
Object.assign(process.env, Object.fromEntries(Object.entries(supabaseEnv).filter(([k]) => !process.env[k])));

const e2ePort = Number(process.env.E2E_PORT ?? 3000);
const e2eOrigin = "http://localhost:" + e2ePort;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: e2eOrigin,
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "pnpm dev --port " + e2ePort,
    url: e2eOrigin + "/bienvenida",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: supabaseEnv.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: supabaseEnv.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder-service-key",
    },
  },
});
