import { defineConfig, devices } from "@playwright/test";

/**
 * Production smoke suite (tests/e2e-prod). Runs against the live site with a dedicated test
 * account: run it through `pnpm e2e:prod` (scripts/e2e-prod.sh), which provides the credentials.
 */
export const PROD_URL = process.env.E2E_BASE_URL ?? "https://kizuna-tracker.vercel.app";
export const STORAGE_STATE = "tests/e2e-prod/.auth/state.json";

export default defineConfig({
  testDir: "tests/e2e-prod",
  outputDir: "tests/e2e-prod/.results",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: PROD_URL,
    trace: "retain-on-failure",
    viewport: { width: 390, height: 844 },
    locale: "es-CL",
    timezoneId: "America/Santiago",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    {
      name: "chromium",
      testMatch: /\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, storageState: STORAGE_STATE },
    },
  ],
});
