# Sub-retos (challenge_items)

A challenge used to hold one habit pair. It now holds N of them, called sub-retos in the UI and
`challenge_items` in the database. The terms (frequency unit, weeks, fine) still belong to the challenge.
Each sub-reto adds a habit pair and, for weekly challenges, its own weekly target.

Migration: `supabase/migrations/20261125120000_challenge_items_expand.sql` (expand only).
pgTAP: `supabase/tests/challenge_items.test.sql`.

## Model

| Table | Holds |
| --- | --- |
| `challenge_items` | One row per habit pair: `position`, `creator_habit_id`, `rival_habit_id`, `target_per_week` (null = daily), `requires_photo`, `status`, `proposed_by`, `starts_on`, `accepted_at`. |
| `challenge_item_results` | One row per closed period, item and player: `met`, `done`, `needed`. Written by the cron; survives unfriending and deleted check-ins, so debt reasons and history keep working. |

- Item columns are side-relative: `creator_habit_id` is always the challenge creator's habit, whoever proposed the item. `proposed_by` says who has to wait and who has to answer.
- Item status: `proposed`, `active`, `declined`, `withdrawn`. An `active` item always has both habits and a `starts_on`.
- Unique live-habit indexes: a habit can sit in only one live item of a challenge, per side.
- RLS: participants can select both tables. Nobody has insert, update or delete grants. Every write goes through the RPCs below, triggers or the service role (cron).
- The legacy columns on `challenges` (`creator_habit_id`, `rival_habit_id`, `target_per_week`, `requires_photo`) remain and mirror the **primary item**, the live item with the lowest `position`. Old code, direct inserts and the RLS insert policy keep working.

## Rules

- A new challenge is still a client insert on `challenges`. An AFTER INSERT trigger seeds item 1 from the legacy columns.
- "Open" means the item is live (proposed or active) AND its challenge is live. Cancel, unfriend and account deletion never write item status.
- At most 5 live items per challenge (`too_many_items`).
- While the challenge is `proposed`, only the creator adds items and the rival accepts all of them in one `respond_challenge` (a map `itemId -> habitId`). No extra notification is sent.
- While the challenge is `active`, either player adds an item and the **other** player answers it: accept with one of their habits, or decline. The proposer can withdraw it while nobody has answered. The last proposed item of a proposed challenge cannot be withdrawn (`last_item`).
- A sub-reto added to an active challenge starts at the next period boundary, computed when it is accepted (`next_item_start`). With no whole period left it is refused (`challenge_ending`). Periods stay whole: no pro-rating.
- A photo sub-reto only takes photo habits on both sides.
- Fail-any: in each period a player loses if they miss ANY applicable item. An item applies once `item.starts_on <= period.start`. One debt per losing player and period, with the usual amount. If both lose, the existing offset rule applies.
- The guards (visibility, photo, quantity, switch, items, `habit_date_period_closed`, `remove_quantity_entry`, `reject_checkin`) read items, not the legacy columns. Closed-period locks only apply from the item's `starts_on`.

## RPCs

All are SECURITY DEFINER, `search_path=''`, granted to `authenticated`.

| RPC | Returns | Errors |
| --- | --- | --- |
| `respond_challenge(p_id, p_accept, p_rival_habit_id default null, p_item_habits jsonb default null)` | void | `challenge_not_found`, `not_rival`, `challenge_not_proposed`, `rival_habit_required`, `rival_habit_invalid`, `rival_habit_needs_photo`, `rival_habit_duplicate`, `creator_habit_unavailable`, `item_not_found`, `not_friends` |
| `add_challenge_item(p_challenge_id, p_habit_id, p_target_per_week default null)` | item id | `challenge_not_found`, `not_creator`, `challenge_not_open`, `not_friends`, `invalid_target`, `habit_invalid`, `too_many_items`, `habit_already_in_challenge`, `challenge_ending` |
| `respond_challenge_item(p_item_id, p_accept, p_habit_id default null)` | challenge id | `item_not_found`, `challenge_not_active`, `not_responder`, `item_not_proposed`, `habit_required`, `habit_invalid`, `habit_needs_photo`, `proposer_habit_unavailable`, `habit_already_in_challenge`, `not_friends`, `challenge_ending` |
| `withdraw_challenge_item(p_item_id)` | challenge id | `item_not_found`, `not_proposer`, `item_not_proposed`, `last_item` |

`respond_challenge` keeps its old 3-argument call shape (named arguments), so older clients still work. The old function was dropped and replaced, not overloaded. Internal helpers (`challenge_items_seed`, `next_item_start`, the sync triggers) are not callable from the API roles.

The Spanish copy for every code lives in `src/lib/challenge-errors.ts` (`mapChallengeError`, exact match first because `habit_invalid` is a substring of `rival_habit_invalid`).

## The cron

`/api/cron/close-periods` runs `closeDuePeriods` (`src/lib/close-periods.ts`); the `kizuna-cron` job calls it every 15 minutes.

1. The repo (`close-periods-repo.ts`) returns each live challenge with its `active` items (`challenge_items!inner`).
2. For each closable period, `evaluateItems` (`src/domain/challenges.ts`) decides, per applicable item and player, `met`, `done` and `needed`.
3. Order inside a period: `insertItemResults` (idempotent upsert on `challenge_id, period_start, item_id, player_id`), debts (one per losing player, idempotent on the existing key), the `new_debt` notification (payload adds `item_ids`), then `insertPeriod`. A crash at any point is repaired by the next run.
4. Photo items count only non-rejected photo check-ins; a period waits for the check-in reads of every applicable photo habit.
5. Periods closed before this change have no result rows. History and debt reasons fall back to the legacy text.

## Rollout order

**The migration must reach production BEFORE `git push`: Vercel deploys `main` on every push, so a push without the migration puts the new code on the old database.**

The new code against the old database is NOT safe. The old code against the new database is safe (seed trigger, 3-argument `respond_challenge`, mirrored columns). So:

1. Take a fresh production dump (`pg_dump`, schema and data). Do not rely on the `konjo-pre-0025*` files.
2. Apply `20261125120000_challenge_items_expand.sql` to production, as the `postgres` role. The file is wrapped in `begin; ... commit;`, so with `psql` use `psql -v ON_ERROR_STOP=1 -f 20261125120000_challenge_items_expand.sql` (a failure rolls everything back and stops). Never `supabase db reset --linked` or `db push --include-seed`.
   After it succeeds, record it so a later `supabase db push` does not try to apply it again: `supabase migration repair --status applied 20261125120000`.
3. Verify: `select count(*) from challenge_items` equals `select count(*) from challenges`; the legacy columns equal item 1 (`select count(*) from challenges c join challenge_items i on i.challenge_id = c.id and i.position = 1 where c.creator_habit_id is distinct from i.creator_habit_id`, expect 0).
4. Only now `git push` (Vercel deploys the code).
5. Verify: run the cron by hand (it should close nothing new or produce the same debts), add and accept a sub-reto between two test accounts, check that a guard fires from the UI (for example the visibility change of a habit used by item 2).
6. Watch at least one cron cycle (15 minutes) and the next period close.

### Rollback

- First revert the code deploy. The database stays compatible with the old code.
- A full database revert needs a down script: drop the triggers and the four RPCs, restore the previous bodies of the re-pointed functions (from migrations 0005, 0007, 0018, 0021, 0023) and the 3-argument `respond_challenge` with its grant, then drop `challenge_item_results` and `challenge_items`. Sub-retos added after the migration are lost; legacy debts and periods are intact.

## Future contract step (separate change)

Once the code has run stably on items alone:

1. Stop reading the legacy columns anywhere (the cron and every view already read items).
2. Drop the mirror triggers (`challenge_items_sync_legacy`, `challenges_sync_items`) and the seed trigger once new challenges are created through an RPC that writes items directly.
3. Drop `challenges.creator_habit_id`, `rival_habit_id`, `target_per_week` and `requires_photo` (and the RLS insert policy that depends on them, replaced by an RPC).
4. Regenerate `src/lib/supabase/database.types.ts`.
5. Keep `challenge_items` and `challenge_item_results`: they are the permanent model.
