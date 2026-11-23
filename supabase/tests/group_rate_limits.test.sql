begin;
-- Where guessing is limited (0024): group_invite_preview is service-role only, group_invite_preview_for tells the server whether
-- the viewer already belongs, join_group counts failed attempts per signed-in person, rate_limit is the server's generic limiter.
-- Runs with 0024 prepended on a database that already has 0023. Own fixtures, rolled back.
create extension if not exists pgtap with schema extensions;
select plan(77);

create schema tests;
create function tests.u(n int) returns uuid language sql immutable as $f$
  select ('e3900000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $f$;
create function tests.h(u int, k int) returns uuid language sql immutable as $f$
  select ('b3900000-0000-0000-' || lpad(u::text, 4, '0') || '-' || lpad(k::text, 12, '0'))::uuid $f$;
create function tests.login(n int) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', tests.u(n), 'role', 'authenticated')::text, true) $f$;
create table tests.ctx (k text primary key, v uuid);
create function tests.save(key text, val uuid) returns uuid language plpgsql security definer as $f$
begin insert into tests.ctx (k, v) values (key, val) on conflict (k) do update set v = excluded.v; return val; end $f$;
create function tests.g(k text) returns uuid language sql stable security definer as $f$
  select v from tests.ctx where ctx.k = $1 $f$;
create temp table t_codes (k text primary key, code text);
grant all on t_codes to authenticated, anon, service_role;
grant usage on schema tests to authenticated, anon, service_role;
grant execute on all functions in schema tests to authenticated, anon, service_role;
grant select on tests.ctx to authenticated, anon, service_role;

insert into auth.users (id) select tests.u(g) from generate_series(1, 12) g;
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone)
select tests.u(g), 'rl_' || lpad(g::text, 3, '0'), 'R' || g, 'Test', '1990-01-01', now(), 'America/Santiago' from generate_series(1, 12) g;
insert into public.habits (id, user_id, name, icon, frequency_type)
select tests.h(u, k), tests.u(u), 'H', 'barbell', 'daily' from generate_series(1, 12) u, generate_series(1, 3) k;

-- ================================================== grants
select is((select bool_or(has_function_privilege(r, p, 'execute'))
  from unnest(array['public.group_invite_preview(text)', 'public.group_invite_preview_for(text,uuid)', 'public.rate_limit(text,integer,integer,boolean)']) p,
       unnest(array['anon', 'authenticated', 'public']) r), false, 'A1 anon and authenticated cannot execute either preview function nor rate_limit');
select is((select bool_and(has_function_privilege('service_role', p, 'execute'))
  from unnest(array['public.group_invite_preview(text)', 'public.group_invite_preview_for(text,uuid)', 'public.rate_limit(text,integer,integer,boolean)']) p),
  true, 'A2 service_role can');
select ok(has_function_privilege('authenticated', 'public.join_group(text,uuid)', 'execute') and not has_function_privilege('anon', 'public.join_group(text,uuid)', 'execute'),
  'A3 join_group keeps its grants');
select is((select count(*)::int from pg_class where relnamespace = 'public'::regnamespace and relrowsecurity and relname in ('group_join_attempts', 'rate_limit_events')), 2,
  'A4 both new tables have row level security');
select is((select count(*)::int from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
  and table_name in ('group_join_attempts', 'rate_limit_events')), 0, 'A5 and no client grant');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('group_invite_preview_for', 'rate_limit', 'join_group')
  and (not p.prosecdef or not coalesce(p.proconfig @> array['search_path=""'], false))), 0, 'A6 the definer functions pin search_path');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('group_invite_preview_for', 'rate_limit', 'join_group', 'groups_normalize_code')
  and p.prosrc ~* '\mexecute\M'), 0, 'A7 no dynamic SQL');
select is((select provolatile from pg_proc where proname = 'groups_normalize_code' and pronamespace = 'public'::regnamespace), 's', 'A8 the normaliser is stable, not immutable');
select ok(public.groups_normalize_code(repeat(' ', 64) || 'K7QM4PXD') is null and public.groups_normalize_code(repeat('a', 65)) is null, 'A9 a code longer than 64 characters is null before any other work');

-- ================================================== group_invite_preview_for
set local role authenticated;
select tests.login(1);
select tests.save('g', public.create_group('Limites', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, false, tests.h(1, 1)));
insert into t_codes select 'c', public.create_group_invite(tests.g('g'));
select tests.login(2);
select public.join_group((select code from t_codes where k = 'c'), tests.h(2, 1));
select tests.login(3);
select public.join_group((select code from t_codes where k = 'c'), tests.h(3, 1));
select public.leave_group(tests.g('g'));
reset role;
set local role service_role;
select is((select array_agg(k order by k)::text from jsonb_object_keys(public.group_invite_preview_for((select code from t_codes where k = 'c'), tests.u(4))) k),
  '{color,commitment_icon,commitment_name,full,icon,member_count,name,requires_photo,target_per_week}', 'B1 a stranger gets exactly the nine keys');
select is((select array_agg(k order by k)::text from jsonb_object_keys(public.group_invite_preview_for((select code from t_codes where k = 'c'))) k),
  '{color,commitment_icon,commitment_name,full,icon,member_count,name,requires_photo,target_per_week}', 'B2 so does a null viewer (default)');
select is((select array_agg(k order by k)::text from jsonb_object_keys(public.group_invite_preview_for((select code from t_codes where k = 'c'), tests.u(3))) k),
  '{color,commitment_icon,commitment_name,full,icon,member_count,name,requires_photo,target_per_week}', 'B3 a former member gets the nine keys only');
select is(public.group_invite_preview_for(' ' || lower((select code from t_codes where k = 'c')) || ' ', tests.u(2)),
  public.group_invite_preview_for((select code from t_codes where k = 'c'), tests.u(4)) || jsonb_build_object('member', true, 'group_id', tests.g('g')),
  'B4 an active member gets two more keys: member true and group_id (input normalised)');
select is((select array_agg(k order by k)::text from jsonb_object_keys(public.group_invite_preview_for((select code from t_codes where k = 'c'), tests.u(1))) k),
  '{color,commitment_icon,commitment_name,full,group_id,icon,member,member_count,name,requires_photo,target_per_week}', 'B5 the admin too: eleven keys');
select is(public.group_invite_preview_for((select code from t_codes where k = 'c'), tests.u(4)), public.group_invite_preview((select code from t_codes where k = 'c')),
  'B6 the nine keys are those of group_invite_preview');
select is(public.group_invite_preview_for('K7QM4PX', tests.u(2)), null, 'B7 a malformed code is null even for a member');
select is(public.group_invite_preview_for('ZZZZZZZZ', tests.u(2)), null, 'B8 an unknown code is null');
select is(public.group_invite_preview_for(null, tests.u(2)), null, 'B9 a null code is null');
select is(public.group_invite_preview_for(repeat(' ', 100) || (select code from t_codes where k = 'c'), tests.u(2)), null, 'B10 over 64 characters is null');
reset role;
update public.group_invites set uses = max_uses where code = (select code from t_codes where k = 'c');
set local role service_role;
select is(public.group_invite_preview_for((select code from t_codes where k = 'c'), tests.u(2)), null, 'B11 a used-up code is null even for a member');
reset role;
update public.group_invites set uses = 0, expires_at = now() - interval '1 minute' where code = (select code from t_codes where k = 'c');
set local role service_role;
select is(public.group_invite_preview_for((select code from t_codes where k = 'c'), tests.u(2)), null, 'B12 an expired code is null');
reset role;
update public.group_invites set expires_at = now() + interval '3 days' where code = (select code from t_codes where k = 'c');
update public.groups set archived_at = now() where id = tests.g('g');
set local role service_role;
select is(public.group_invite_preview_for((select code from t_codes where k = 'c'), tests.u(2)), null, 'B13 an archived group is null');
reset role;
update public.groups set archived_at = null where id = tests.g('g');

-- ================================================== join_group counts failed attempts per signed-in person
set local role authenticated;
select tests.login(5);
select is(public.join_group('ZZZZZZZZ', tests.h(5, 1)), null, 'C1 attempt ' || g || ' is null, not an exception') from generate_series(1, 10) g;
reset role;
select is((select count(*)::int from public.group_join_attempts where user_id = tests.u(5)), 10, 'C2 ten failures recorded ten rows');
set local role authenticated;
select tests.login(5);
select throws_ok($$ select public.join_group('ZZZZZZZZ', tests.h(5, 1)) $$, 'P0001', 'too_many_attempts', 'C3 the eleventh call raises too_many_attempts');
select throws_ok(format($$ select public.join_group(%L, tests.h(5, 1)) $$, (select code from t_codes where k = 'c')), 'P0001', 'too_many_attempts',
  'C4 even with a VALID code');
reset role;
select is((select count(*)::int from public.group_join_attempts where user_id = tests.u(5)), 10, 'C5 a refused call records nothing');
set local role authenticated;
select tests.login(4);
select lives_ok(format($$ select public.join_group(%L, tests.h(4, 1)) $$, (select code from t_codes where k = 'c')), 'C6 another person''s attempts do not count: a stranger joins');
reset role;
select is((select count(*)::int from public.group_join_attempts where user_id = tests.u(4)), 0, 'C7 a success records nothing');
update public.group_join_attempts set attempted_at = now() - interval '2 hours' where user_id = tests.u(5);
set local role authenticated;
select tests.login(5);
select lives_ok(format($$ select public.join_group(%L, tests.h(5, 1)) $$, (select code from t_codes where k = 'c')), 'C8 attempts older than an hour do not count');
reset role;
select is((select count(*)::int from public.group_join_attempts where user_id = tests.u(5)), 10, 'C9 they are kept (younger than a day), and the success cleared nothing');
-- exceptions other than not-found record nothing; a success before the limit clears nothing
set local role authenticated;
select tests.login(6);
select is(public.join_group('ZZZZZZZZ', tests.h(6, 1)), null, 'C10 two failures');
select is(public.join_group(' k7 ', tests.h(6, 1)), null, 'C11 (malformed counts too)');
select throws_ok(format($$ select public.join_group(%L, tests.h(1, 2)) $$, (select code from t_codes where k = 'c')), 'P0001', 'habit_not_eligible', 'C12 habit_not_eligible is an exception');
select lives_ok(format($$ select public.join_group(%L, tests.h(6, 1)) $$, (select code from t_codes where k = 'c')), 'C14 the success');
select throws_ok(format($$ select public.join_group(%L, tests.h(6, 2)) $$, (select code from t_codes where k = 'c')), 'P0001', 'already_member', 'C15 already_member is an exception');
reset role;
select is((select count(*)::int from public.group_join_attempts where user_id = tests.u(6)), 2, 'C16 only the two not-found outcomes were recorded');
-- expired / used-up / archived / removed-before all return null and record
insert into public.group_invites (code, group_id, created_by, max_uses, expires_at) values ('EXPYRED3', tests.g('g'), tests.u(1), 5, now() - interval '1 minute');
insert into public.group_invites (code, group_id, created_by, max_uses, uses) values ('USEDUP33', tests.g('g'), tests.u(1), 5, 5);
set local role authenticated;
select tests.login(7);
select is(public.join_group('EXPYRED3', tests.h(7, 1)), null, 'C17 an expired code returns null');
select is(public.join_group('USEDUP33', tests.h(7, 1)), null, 'C18 a used-up code returns null');
reset role;
select is((select count(*)::int from public.group_join_attempts where user_id = tests.u(7)), 2, 'C19 and each recorded one attempt');
-- old attempts are deleted opportunistically
insert into public.group_join_attempts (user_id, attempted_at) values (tests.u(8), now() - interval '25 hours'), (tests.u(8), now() - interval '30 minutes');
set local role authenticated;
select tests.login(8);
select is(public.join_group('ZZZZZZZZ', tests.h(8, 1)), null, 'C20 a failure by a person with old rows');
reset role;
select is((select count(*)::int from public.group_join_attempts where user_id = tests.u(8)), 2, 'C21 the 25-hour-old row was deleted, the recent one and the new one remain');
select is((select count(*)::int from public.group_join_attempts where user_id = tests.u(5) and attempted_at < now() - interval '1 hour'), 10, 'C22 only the caller''s own old rows are touched (5 was not the caller)');
-- a removed member with an older code: null + attempt
set local role authenticated;
select tests.login(1);
select public.remove_group_member(tests.g('g'), tests.u(6));
insert into t_codes select 'c2', public.create_group_invite(tests.g('g'));
select tests.login(6);
select is(public.join_group((select code from t_codes where k = 'c'), tests.h(6, 1)), null, 'C23 the removed-before rule returns null');
select lives_ok(format($$ select public.join_group(%L, tests.h(6, 1)) $$, (select code from t_codes where k = 'c2')), 'C24 a newer invite still lets them in');
reset role;
select is((select count(*)::int from public.group_join_attempts where user_id = tests.u(6)), 3, 'C25 the removed-before outcome recorded one more attempt');

-- ================================================== rate_limit (service role)
set local role service_role;
select is(public.rate_limit('ip:1.2.3.4', 3, 60, true), false, 'D1 below the limit: not blocked (1 of 3)');
select is(public.rate_limit('ip:1.2.3.4', 3, 60, true), false, 'D2 (2 of 3)');
select is(public.rate_limit('ip:1.2.3.4', 3, 60, true), false, 'D3 (3 of 3, still allowed: three events fit)');
select is(public.rate_limit('ip:1.2.3.4', 3, 60, true), true, 'D4 at the limit: blocked');
select is(public.rate_limit('ip:1.2.3.4', 3, 60, false), true, 'D5 a check-only call is blocked too');
reset role;
select is((select count(*)::int from public.rate_limit_events where key_hash = pg_catalog.sha256(convert_to('ip:1.2.3.4', 'UTF8'))), 3, 'D6 a blocked call records nothing');
select is((select count(*)::int from public.rate_limit_events where encode(key_hash, 'escape') like '%1.2.3.4%' or encode(key_hash, 'escape') like '%ip:%'), 0, 'D7 no clear-text key in the table');
select is((select bool_and(length(key_hash) = 32) from public.rate_limit_events), true, 'D8 only 32-byte SHA-256 digests are stored');
set local role service_role;
select is(public.rate_limit('ip:9.9.9.9', 3, 60, false), false, 'D9 below the limit: check-only is not blocked');
reset role;
select is((select count(*)::int from public.rate_limit_events where key_hash = pg_catalog.sha256(convert_to('ip:9.9.9.9', 'UTF8'))), 0, 'D10 and records nothing');
update public.rate_limit_events set at = clock_timestamp() - interval '2 minutes' where key_hash = pg_catalog.sha256(convert_to('ip:1.2.3.4', 'UTF8'));
set local role service_role;
select is(public.rate_limit('ip:1.2.3.4', 3, 60, true), false, 'D11 once the window has passed the events no longer count');
-- clamps
select is(public.rate_limit('clamp:a', 0, 60, true), false, 'D12 a limit of 0 is clamped to 1: the first call passes');
select is(public.rate_limit('clamp:a', -7, 60, true), true, 'D13 and the second is blocked');
select is(public.rate_limit('clamp:b', 1, 0, true), false, 'D14 a window of 0 is clamped to 1 second');
reset role;
update public.rate_limit_events set at = clock_timestamp() - interval '5 seconds' where key_hash = pg_catalog.sha256(convert_to('clamp:b', 'UTF8'));
set local role service_role;
select is(public.rate_limit('clamp:b', 1, 0, false), false, 'D15 so a 5-second-old event is outside it');
select is(public.rate_limit('clamp:c', 1, 5, true), false, 'D16 first call');
reset role;
update public.rate_limit_events set at = clock_timestamp() - interval '2 hours' where key_hash = pg_catalog.sha256(convert_to('clamp:c', 'UTF8'));
set local role service_role;
select is(public.rate_limit('clamp:c', 1, 1000000, false), true, 'D17 a window of 1000000 is clamped to 86400 seconds: a 2-hour-old event still counts');
select is(public.rate_limit('clamp:c', 5000, 60, false), false, 'D18 a limit of 5000 is clamped (no error)');
reset role;
-- cleanup: that key's events older than a day, and at most 500 other expired rows
insert into public.rate_limit_events (key_hash, at)
select pg_catalog.sha256(convert_to('old:' || g, 'UTF8')), clock_timestamp() - interval '3 days' from generate_series(1, 600) g;
insert into public.rate_limit_events (key_hash, at) values (pg_catalog.sha256(convert_to('clean:me', 'UTF8')), clock_timestamp() - interval '3 days'),
  (pg_catalog.sha256(convert_to('clean:me', 'UTF8')), clock_timestamp() - interval '2 days');
set local role service_role;
select is(public.rate_limit('clean:me', 10, 60, true), false, 'D19 a call that cleans up still answers');
reset role;
select is((select count(*)::int from public.rate_limit_events where key_hash = pg_catalog.sha256(convert_to('clean:me', 'UTF8')) and at < clock_timestamp() - interval '1 day'), 0,
  'D20 the key''s own expired events are gone');
select ok((select count(*)::int from public.rate_limit_events where at < clock_timestamp() - interval '1 day') between 99 and 101, 'D21 at most 500 other expired rows were removed (about 100 of 600 remain)');
select is((select count(*)::int from public.rate_limit_events where key_hash = pg_catalog.sha256(convert_to('clean:me', 'UTF8'))), 1, 'D22 and the new event was recorded');

select * from finish();
rollback;
