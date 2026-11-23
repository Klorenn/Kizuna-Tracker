# Local development

1. Start the local stack (Docker/OrbStack): `supabase start`, then `supabase db reset` (applies every migration and `supabase/seed.sql`; it wipes local data, so only on a fresh stack).
2. Create `.env.local` with the values from `supabase status -o json`:
   `NEXT_PUBLIC_SUPABASE_URL` (API_URL), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ANON_KEY), `SUPABASE_SERVICE_ROLE_KEY` (SERVICE_ROLE_KEY).
   Never commit this file.
3. `pnpm install`, then `pnpm dev` and open http://localhost:3000.

## Test users (seed, local only)

| User   | Email               | @usuario | Password        |
| ------ | ------------------- | -------- | --------------- |
| Ana    | user_a@example.com  | user_a   | `kizuna-test-1` |
| Beto   | user_b@example.com  | user_b   | `kizuna-test-1` |

Seeded data: Ana and Beto are friends. Ana has Leer (public, 10-day streak) and Gimnasio (friends, photo check-ins; the proof files themselves are not seeded). Beto has Correr. They share an active weekly challenge (Leer vs Correr, $2.500 fine) and Beto owes Ana one fine. Public profile: http://localhost:3000/@user_a.

## Tests

- `pnpm test` (unit), `pnpm typecheck`, `pnpm lint`.
- `supabase test db` (pgTAP; each file clears the seed inside its own rolled-back transaction).
- `pnpm e2e`: Playwright at 390x844. With the local stack running, the config reads the keys from `supabase status` at runtime (nothing is written to disk). Explicit env vars win. If a dev server is already running on port 3000 it is reused, so start it with the same env or stop it first. Specs needing Supabase skip when it is not reachable. Run `supabase db reset` first so the seeded specs find their data.

`supabase db reset` also wipes the users, habits and challenges the e2e specs leave behind; run it whenever you want a clean demo state.
