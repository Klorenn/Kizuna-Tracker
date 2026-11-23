#!/usr/bin/env node
// Starts `next dev` against the local Supabase stack.
// Keys are read from `supabase status -o json` at runtime and passed as process env only;
// nothing is written to disk. Explicit env vars win.
import { execFileSync, spawn } from "node:child_process";

function localSupabaseEnv() {
  try {
    const out = execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const s = JSON.parse(out.slice(out.indexOf("{")));
    return {
      NEXT_PUBLIC_SUPABASE_URL: s.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: s.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: s.SERVICE_ROLE_KEY,
    };
  } catch {
    console.error("No pude leer `supabase status`. ¿Corriste `supabase start`?");
    process.exit(1);
  }
}

const env = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  ...localSupabaseEnv(),
  ...process.env,
};

const child = spawn("pnpm", ["exec", "next", "dev", "--turbopack", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});
child.on("exit", (code) => process.exit(code ?? 0));
