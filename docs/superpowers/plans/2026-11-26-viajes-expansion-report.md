# Viajes expansion report

Status: DONE_WITH_CONCERNS

Tasks completed: 9–14. Tasks 1–8 were left as they were.

Branch: `feat/mapa-salidas`. No commit, no push, no `next build`.

## Tests

| Command | Result |
|---|---|
| `npx vitest run` | 4277 passed, 3 failed, 1 todo. The failures are the pre-existing ones in `tests/unit/group-wall.test.ts` (alt text) and `tests/unit/feed-photo-loading.test.ts` (img width/height). Those files were not part of this change. |
| `supabase test db supabase/tests/trips.test.sql supabase/tests/outing_history.test.sql` | Did not run. Docker is down. `ECONNREFUSED 127.0.0.1:54322`. |

`npx vitest run` was not a `next build`.

## What landed

- Task 9. `trips` and `outings.trip_id` (`on delete set null`). `create_trip`, `add_trip_stop`, `my_trips`. A trip needs two owned outings. A new stop is the current month or a month the trip already touches. `/mapa/viajes/[id]` lists the stops `my_trips` returned and reuses `OutingForm`. No group, members, or fine.
- Task 10. Private bucket `outing-photos` (JPEG, 5 MB, no authenticated policy). `set_outing_photo` is service role only. `outing_photo_path` is authenticated and returns null when the caller does not participate. The route strips metadata with `stripJpegMetadata` before upload and does not read coordinates. Quiet stat from pins the caller already sees: "Con Sofía: 4 lugares". Hoy shows "Viaje · {name}" linking to the trip when today falls inside a trip. It does not call `create_checkin`.
- Task 11. `my_month_index` lists only months where the owner has at least one outing, with that month's floor. The Meses section is on `/mapa`, owner data only. A failed read is `LoadFailed`, not "0 de 1".
- Task 12. `repeat_outing` copies place, key, coordinates, and note into next month as `planned`. It does not copy Fui, the photo, the trip, or the invitation. A second tap creates another draft. The button is "Repetir el mes que viene" and stays disabled while the action is in flight.
- Task 13. `dueMonthDay` plus `runOutingMonthNudge` on the reminders cron. Day 15 at 10:00 local, 15-minute window. Inserts `outing_month_nudge` with `pushed_at` already set. No `sendPush`. The kind check now includes `outing_month_nudge`. No new settings column.
- Task 14. Pins already returned by `my_map` are grouped by place key: "Pucón · 3 veces", "1 vez" when there is one.

Account deletion removes `outing-photos` objects under `{userId}/`, then the invitee's invites, the owner's outings, then the owner's trips.

Database function and table types were written by hand in `src/lib/supabase/database.types.ts`. `supabase gen types` was not run.

## Files created

- `supabase/migrations/20261201120000_trips.sql`
- `supabase/migrations/20261201130000_outing_photos.sql`
- `supabase/migrations/20261201140000_outing_month_nudge.sql`
- `supabase/migrations/20261201150000_outing_history.sql`
- `supabase/tests/trips.test.sql` (`plan(34)`, not executed)
- `supabase/tests/outing_history.test.sql` (`plan(28)`, not executed)
- `src/domain/trips.ts`
- `src/domain/outing-memory.ts`
- `src/lib/trips-data.ts`
- `src/lib/outing-photo.ts`
- `src/lib/outing-nudge.ts`
- `src/lib/outing-nudge-repo.ts`
- `src/app/(app)/mapa/viajes/[id]/page.tsx`
- `src/app/api/outings/[id]/photo/route.ts`
- `src/components/map/CreateTrip.tsx`
- `src/components/map/RepeatOuting.tsx`
- `src/components/map/OutingPhotoUpload.tsx`
- `tests/domain/trips.test.ts`
- `tests/domain/outing-memory.test.ts`
- `tests/unit/outing-photo.test.ts`
- `tests/unit/outing-nudge.test.ts`

## Concerns

- Local Postgres is down, so `trips.test.sql` and `outing_history.test.sql` have not passed. Trip privacy, the month index, and `repeat_outing` are unproven until `supabase test db` can connect. The history test expects three owned months and treats January 2026 as distinct from the current and previous month, which is true on 26 Nov 2026.
- `my_map` now also returns `is_owner`, `companion_id`, and `companion_name` on pins. Phase 2 keys stay. The quiet stat and "create a trip from rows you already see" use those fields. There is no new read RPC.
- A failed photo signature becomes no image. It does not turn the map into `LoadFailed` and it does not invent "0 de 1". If `my_trips` fails, Hoy omits the chip and leaves the month row on its own load state.
- The day-15 notice goes to every live profile whose own month is still 0, including someone with no outings. It uses that person's own completed count (own Fui, or an accepted outing they went on). It does not tell a companion that the owner's month is empty, and it does not push.
- The new map, trip, photo, and repeat screens were not opened in a browser.
- The three full-suite failures are in the group wall and the feed photo cards. This change does not touch those components.
