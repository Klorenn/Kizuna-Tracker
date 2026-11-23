begin;
-- Short invitation codes (0024): 8 characters from 23456789ABCDEFGHJKLMNPQRSTUVWXYZ, normalised input, old 32-hex invites retired.
-- Runs against a database that already has 0023 (prepend only 0024). Own fixtures, rolled back.
create extension if not exists pgtap with schema extensions;
select plan(78);

create schema tests;
create function tests.u(n int) returns uuid language sql immutable as $f$
  select ('e3800000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $f$;
create function tests.h(u int, k int) returns uuid language sql immutable as $f$
  select ('b3800000-0000-0000-' || lpad(u::text, 4, '0') || '-' || lpad(k::text, 12, '0'))::uuid $f$;
create function tests.login(n int) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', tests.u(n), 'role', 'authenticated')::text, true) $f$;
create table tests.ctx (k text primary key, v uuid);
create function tests.save(key text, val uuid) returns uuid language plpgsql security definer as $f$
begin insert into tests.ctx (k, v) values (key, val) on conflict (k) do update set v = excluded.v; return val; end $f$;
create function tests.g(k text) returns uuid language sql stable security definer as $f$
  select v from tests.ctx where ctx.k = $1 $f$;
create temp table t_codes (k text, code text);
grant all on t_codes to authenticated, anon, service_role;
-- mints n codes one after the other (revoking each so the cap of five and the reuse rule do not interfere)
create function tests.mint(gid uuid, n int) returns void language plpgsql as $f$
begin
  for i in 1..n loop
    insert into t_codes values ('mint', public.create_group_invite(gid));
    perform public.revoke_group_invites(gid);
  end loop;
end $f$;
grant usage on schema tests to authenticated, anon;
grant execute on all functions in schema tests to authenticated, anon;
grant select on tests.ctx to authenticated, anon;

insert into auth.users (id) select tests.u(g) from generate_series(1, 6) g;
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone)
select tests.u(g), 'sc_' || lpad(g::text, 3, '0'), 'S' || g, 'Test', '1990-01-01', now(), 'America/Santiago' from generate_series(1, 6) g;
insert into public.habits (id, user_id, name, icon, frequency_type)
select tests.h(u, k), tests.u(u), 'H', 'barbell', 'daily' from generate_series(1, 6) u, generate_series(1, 2) k;

-- ================================================== shape and alphabet of minted codes
set local role authenticated;
select tests.login(1);
select tests.save('g', public.create_group('Codigos', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, false, tests.h(1, 1)));
select tests.mint(tests.g('g'), 200);
reset role;
select is((select count(*)::int from t_codes), 200, 'A1 200 codes minted');
select is((select count(distinct code)::int from t_codes), 200, 'A2 no duplicates');
select is((select bool_and(code ~ '^[2-9A-HJ-NP-Z]{8}$') from t_codes), true, 'A3 every code is 8 characters of the alphabet');
select is((select bool_or(code ~ '[01IO]') from t_codes), false, 'A4 never a 0, 1, I or O');
select is((select bool_and(code = upper(code)) from t_codes), true, 'A5 all upper case, no separator');
select is((select count(distinct c)::int from t_codes, regexp_split_to_table(code, '') c), 32, 'A6 all 32 symbols of the alphabet occur (no symbol is unreachable)');
select ok((select max(n) <= 120 and min(n) >= 20 from (select count(*) n from t_codes, regexp_split_to_table(code, '') c group by c) x),
  'A7 the symbols are spread evenly (1600 characters, about 50 each)');
select is((select count(*)::int from public.group_invites where group_id = tests.g('g') and code ~ '^[2-9A-HJ-NP-Z]{8}$'), 200, 'A8 they are stored as they were returned');
select is((select column_default from information_schema.columns where table_name = 'group_invites' and column_name = 'code'), null,
  'A9 the column has no default any more: only the functions produce codes');

-- ================================================== the check constraint: either shape, new rows cannot be anything else
select lives_ok($$ insert into public.group_invites (code, group_id, created_by, max_uses) values ('K7QM4PXD', tests.g('g'), tests.u(1), 5) $$, 'B1 a short code is accepted');
select lives_ok($$ insert into public.group_invites (code, group_id, created_by, max_uses) values (repeat('a', 32), tests.g('g'), tests.u(1), 5) $$, 'B2 an old 32-hex row is still accepted');
select throws_ok($$ insert into public.group_invites (code, group_id, created_by, max_uses) values ('k7qm4pxd', tests.g('g'), tests.u(1), 5) $$, '23514', null, 'B3 a lower-case short code is refused');
select throws_ok($$ insert into public.group_invites (code, group_id, created_by, max_uses) values ('K7QM4PX0', tests.g('g'), tests.u(1), 5) $$, '23514', null, 'B4 a code with a 0 is refused');
select throws_ok($$ insert into public.group_invites (code, group_id, created_by, max_uses) values ('abc', tests.g('g'), tests.u(1), 5) $$, '23514', null, 'B5 any other shape is refused');
delete from public.group_invites where code in ('K7QM4PXD', repeat('a', 32));

-- ================================================== normalisation and rejection
insert into public.group_invites (code, group_id, created_by, max_uses) values ('K7QM4PXD', tests.g('g'), tests.u(1), 5);
set local role service_role;
select is(public.group_invite_preview(v) ->> 'name', 'Codigos', 'C1 the preview finds [' || v || ']')
  from unnest(array['K7QM4PXD', 'k7qm4pxd', 'k7qm-4pxd', ' K7QM 4PXD ', 'K7QM-4PXD', 'k7-qm4pxd', E'\tK7QM4PXD\n']) v;
select is(public.group_invite_preview(v), null, 'C2 the preview answers null without an error for [' || coalesce(v, 'null') || ']')
  from unnest(array['K7QM4PX', 'K7QM4PXDA', 'K7QM4PX0', 'K7QM4PXI', 'K7QM4PXO', 'K7QM4PX1', 'K7QM4PXl', 'K7QM4PXL', 'K7QM4PXo', 'K7QM4PXi', E'\uFF2B7QM4PXD', repeat(' ', 100) || 'K7QM4PXD', 'K7QM-4P-XD', 'K7QM4PX!', '', '   ', '-', 'ZZZZZZZZ', repeat('a', 32), null]) v;
select is((select array_agg(k order by k)::text from jsonb_object_keys(public.group_invite_preview('k7qm-4pxd')) k),
  '{color,commitment_icon,commitment_name,full,icon,member_count,name,requires_photo,target_per_week}', 'C3 the preview keys are unchanged');
reset role;
set local role authenticated;
select tests.login(2);
select is(public.join_group(v, tests.h(2, 1)), null, 'C4 join_group: null (not found) for [' || v || ']')
  from unnest(array['K7QM4PX', 'K7QM4PXDA', 'K7QM4PX0', 'K7QM4PXI', 'K7QM-4P-XD', '', '   ', 'ZZZZZZZZ', repeat('a', 32)]) v;
select is(public.join_group(null, tests.h(2, 1)), null, 'C5 a null code is null too');
reset role;
select is((select count(*)::int from public.group_join_attempts where user_id = tests.u(2)), 10, 'C5b each of those ten recorded one attempt');
delete from public.group_join_attempts;
set local role authenticated;
select tests.login(2);
select tests.save('joined', public.join_group(' k7qm-4pxd ', tests.h(2, 1)));
select is(tests.g('joined'), tests.g('g'), 'C6 join_group accepts a typed code: lower case, hyphen, spaces');
reset role;
select is((select uses from public.group_invites where code = 'K7QM4PXD'), 1, 'C7 and it consumes the canonical invite');

-- ================================================== create_group_invite: old shape retired, reuse, removal rule (group 2, admin 3)
set local role authenticated;
select tests.login(3);
select tests.save('g2', public.create_group('Segundo', 'barbell', 'salvia', null, 'Gym', 'barbell', 3, false, tests.h(3, 1)));
reset role;
insert into public.group_invites (code, group_id, created_by, max_uses) values (repeat('c', 32), tests.g('g2'), tests.u(3), 40);
set local role authenticated;
select tests.login(3);
insert into t_codes select 'g2a', public.create_group_invite(tests.g('g2'));
select matches((select code from t_codes where k = 'g2a'), '^[2-9A-HJ-NP-Z]{8}$', 'D1 an old 32-hex invite is not reused: a short one is minted');
reset role;
select ok((select expires_at <= now() from public.group_invites where code = repeat('c', 32)), 'D2 and the old invite is expired');
select is((select count(*)::int from public.group_invites where group_id = tests.g('g2') and expires_at > now()), 1, 'D3 exactly one valid invite remains');
set local role authenticated;
select tests.login(3);
select is(public.create_group_invite(tests.g('g2')), (select code from t_codes where k = 'g2a'), 'D4 a valid short invite is reused');
select is(public.create_group_invite(tests.g('g2')), (select code from t_codes where k = 'g2a'), 'D5 every time');
select tests.login(4);
select public.join_group((select code from t_codes where k = 'g2a'), tests.h(4, 1));
select tests.login(3);
select public.remove_group_member(tests.g('g2'), tests.u(4));
select tests.login(4);
select is(public.join_group((select code from t_codes where k = 'g2a'), tests.h(4, 1)), null,
  'D6 a removed member cannot come back with the code made before the removal');
select tests.login(3);
insert into t_codes select 'g2b', public.create_group_invite(tests.g('g2'));
select isnt((select code from t_codes where k = 'g2b'), (select code from t_codes where k = 'g2a'), 'D7 after a removal a new short code is minted');
select matches((select code from t_codes where k = 'g2b'), '^[2-9A-HJ-NP-Z]{8}$', 'D8 in the new shape');
select tests.login(4);
select lives_ok(format($$ select public.join_group(%L, tests.h(4, 1)) $$, lower((select code from t_codes where k = 'g2b'))), 'D9 the new code lets them in again, typed in lower case');

-- ================================================== failing cases stay null for anon; revoke unchanged
reset role;
insert into public.group_invites (code, group_id, created_by, max_uses, expires_at) values ('EXPYRED2', tests.g('g2'), tests.u(3), 5, now() - interval '1 minute');
insert into public.group_invites (code, group_id, created_by, max_uses, uses) values ('USEDUP22', tests.g('g2'), tests.u(3), 5, 5);
set local role service_role;
select is(public.group_invite_preview('EXPYRED2'), null, 'E1 an expired code previews as null');
select is(public.group_invite_preview('USEDUP22'), null, 'E2 a used-up code previews as null');
reset role;
set local role authenticated;
select tests.login(3);
select is(public.revoke_group_invites(tests.g('g2')), 2, 'E3 revoke_group_invites is unchanged: it expires the two still-active invites (the stale one counts, expired and used-up do not)');
reset role;
set local role service_role;
select is(public.group_invite_preview((select code from t_codes where k = 'g2b')), null, 'E4 a revoked code previews as null');
reset role;
set local role authenticated;
select tests.login(3);
select public.archive_group(tests.g('g2'));
reset role;
insert into public.group_invites (code, group_id, created_by, max_uses) values ('ARCHYVE2', tests.g('g2'), tests.u(3), 5);
set local role service_role;
select is(public.group_invite_preview('ARCHYVE2'), null, 'E5 an archived group''s code previews as null');
reset role;

-- ================================================== grants and helpers
select ok(has_function_privilege('service_role', 'public.group_invite_preview(text)', 'execute') and not has_function_privilege('anon', 'public.group_invite_preview(text)', 'execute') and not has_function_privilege('authenticated', 'public.group_invite_preview(text)', 'execute'), 'F1 the preview is service_role only');
select ok(has_function_privilege('authenticated', 'public.join_group(text,uuid)', 'execute') and not has_function_privilege('anon', 'public.join_group(text,uuid)', 'execute'), 'F2 join_group keeps its grants');
select is((select bool_or(has_function_privilege(r, p, 'execute')) from unnest(array['public.groups_normalize_code(text)', 'public.groups_random_invite_code()']) p, unnest(array['anon', 'authenticated', 'public']) r),
  false, 'F3 the new helpers are not callable by clients');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
  and p.proname in ('create_group_invite', 'group_invite_preview', 'join_group', 'groups_normalize_code', 'groups_random_invite_code')
  and not coalesce(p.proconfig @> array['search_path=""'], false)), 0, 'F4 search_path stays pinned');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
  and p.proname in ('create_group_invite', 'group_invite_preview', 'join_group', 'groups_normalize_code', 'groups_random_invite_code') and p.prosrc ~* '\mexecute\M'), 0,
  'F5 no dynamic SQL');
select is(public.groups_normalize_code(' k7qm 4pxd '), 'K7QM4PXD', 'F6 groups_normalize_code: canonical form');
select is(public.groups_normalize_code('K7QM-4PXD-'), null, 'F7 a trailing second hyphen is not accepted');

-- ================================================== the collision path (invite_unavailable), forced by replacing the generator inside this rolled-back transaction
set local role authenticated;
select tests.login(1);
select public.revoke_group_invites(tests.g('g'));
reset role;
create or replace function public.groups_random_invite_code() returns text language sql as $f$ select 'K7QM4PXD'::text $f$;
set local role authenticated;
select tests.login(1);
select throws_ok($$ select public.create_group_invite(tests.g('g')) $$, 'P0001', 'invite_unavailable', 'G1 a generator that only collides ends in invite_unavailable after the bounded retries');
reset role;
select is((select count(*)::int from public.group_invites where group_id = tests.g('g') and expires_at > now()), 0, 'G2 and nothing was minted');

select * from finish();
rollback;
