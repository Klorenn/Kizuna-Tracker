# Viajes build report

Status: DONE_WITH_CONCERNS

Tasks completed: 1–8. Stopped before task 9. No trips, photos, past-month index, repeat-next-month, day-15 nudge, or per-place counts.

Tasks 1–6 were already on `feat/mapa-salidas`. This pass checked their unit tests and added phase 2 (tasks 7 and 8).

## Tests

| Command | Result |
|---|---|
| `npx vitest run tests/domain/outings.test.ts tests/unit/places.test.ts tests/unit/outings-data.test.ts tests/unit/outing-actions.test.ts tests/unit/outing-map-screen.test.ts tests/unit/month-floor-row.test.ts tests/unit/bottom-nav-active.test.ts tests/unit/public-paths.test.ts tests/unit/delete-account-deps.test.ts tests/unit/copy.test.ts` | 10 files, 87 tests passed (before tasks 7–8) |
| `npx vitest run tests/unit/outings-data.test.ts tests/unit/delete-account-deps.test.ts` | 19 passed after the invite parser and purge order |
| `npx vitest run tests/unit/outing-notify.test.ts tests/unit/outing-actions.test.ts tests/unit/copy.test.ts` | passed (with the parser and map-screen files: 6 files, 41 tests) |
| `npx vitest run` | 4258 passed, 3 failed, 1 todo. Failures are `tests/unit/group-wall.test.ts` (alt text) and `tests/unit/feed-photo-loading.test.ts` (img width/height). Those files were not part of this change. |
| `supabase test db supabase/tests/outing_invites.test.sql` | Did not run. Docker is down. `ECONNREFUSED 127.0.0.1:54322`. |
| `supabase test db supabase/tests/outings.test.sql` | Same, from task 2. Phase 1 pgTAP was never executed. |

`npx vitest run` was not a `next build`.

## What landed in tasks 7 and 8

- `supabase/migrations/20261130140000_outing_invites.sql` — `outing_invites`, invite / respond / `my_outing_invite`, replaced `my_month`, `my_map`, and `mark_outing_went`. `cancel_outing(uuid)` is dropped and recreated as `returns jsonb` because the phase 1 function returns `void`.
- `supabase/tests/outing_invites.test.sql` — `plan(69)`, the 14 behaviors from the plan. Not executed.
- Parser: missing `companion_name` / `invite_status` stay null. `invite_status: 'declined'` drops that row, not the month. `my_map.plans` can be non-empty. A missing `is_owner` counts as the caller's own row.
- `purgeSocial` deletes `outing_invites` by `invitee_id` before `outings` by `owner_id`.
- Notices: `outing_invited`, `outing_accepted`, `outing_declined`, `outing_cancelled`. Invite, respond, and cancel notify after the RPC. A thrown `notify` still returns `{ ok: true }`. Cancel notifies only when `invitee_id` is present.
- `/mapa` lists accepted friends on an own planned outing, shows "Invitación pendiente" instead of a second invite, and `/mapa?salida=<uuid>` renders the place and the dates, with Aceptar / Rechazar only while pending.

Database function and table types were written by hand in `src/lib/supabase/database.types.ts`. `supabase gen types` was not run.

## Concerns

- Local Postgres is down, so neither pgTAP file has passed. Invite privacy (no table grants, pending invite hidden from the invitee, `my_outing_invite` does not leak another outing) is unproven until `supabase test db` can connect.
- `my_month` also returns `is_owner`, so the invitee does not get Quitar or Invitar. `respond_outing_invite` also returns `outing_id`, and `cancel_outing` also returns `place_name`, so the notice can name the place and link back. The keys the plan requires are still there.
- The invite and respond screens were not opened in a browser.
- The three full-suite failures are in the group wall and the feed photo cards. This change does not touch those components.
