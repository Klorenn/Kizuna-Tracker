import { execFileSync } from "node:child_process";

const DB_URL = process.env.E2E_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Clears the local login rate-limit table so repeated runs don't lock the seeded user out. Local DB only; silent otherwise. */
export default function globalSetup() {
  try {
    const host = new URL(DB_URL).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") return;
    execFileSync("psql", [DB_URL, "-qc", "delete from public.login_attempts"], {
      stdio: "ignore",
      timeout: 10_000,
    });
  } catch {
    // psql missing or DB unreachable: nothing to clear.
  }
}
