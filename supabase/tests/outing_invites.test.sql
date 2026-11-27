begin;
-- Outing invites (phase 2). Own fixtures. Rolled back. These rows are not groups.
create extension if not exists pgtap with schema extensions;
select plan(69);

create schema tests;
create function tests.u(n int) returns uuid language sql immutable as $f$
  select ('i3700000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $f$;
create function tests.login(n int) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', tests.u(n), 'role', 'authenticated')::text, true) $f$;
create function tests.nosession() returns void language sql as $f$
  select set_config('request.jwt.claims', '{"role":"authenticated"}', true) $f$;
create table tests.ctx (k text primary key, v uuid);
create function tests.save(key text, val uuid) returns uuid language plpgsql security definer as $f$
begin
  insert into tests.ctx (k, v) values (key, val) on conflict (k) do update set v = excluded.v;
  return val;
end $f$;
create function tests.g(k text) returns uuid language sql stable security definer as $f$
  select v from tests.ctx where ctx.k = $1 $f$;
create function tests.denied(r text, stmt text) returns boolean language plpgsql as $f$
begin
  execute format('set local role %I', r);
  begin
    execute stmt;
  exception when insufficient_privilege then
    reset role; return true;
  when others then
    reset role; return false;
  end;
  reset role;
  return false;
end $f$;
create function tests.local_today(tz text) returns date language sql stable as $$
  select (now() at time zone tz)::date $$;
create function tests.local_month(tz text) returns date language sql stable as $$
  select date_trunc('month', (now() at time zone tz)::timestamp)::date $$;
grant usage on schema tests to authenticated, anon, service_role;
grant execute on all functions in schema tests to authenticated, anon, service_role;
grant select on tests.ctx to authenticated, anon;

insert into auth.users (id) select tests.u(g) from generate_series(1, 4) g;
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone)
select tests.u(g),
       'inv_' || lpad(g::text, 2, '0'),
       case g when 1 then 'Ana' when 2 then 'Sofía' when 3 then 'Carla' else 'Dani' end,
       'Test',
       '1990-01-01',
       now(),
       'America/Santiago'
from generate_series(1, 4) g;
insert into public.friendships (requester_id, addressee_id, status) values
  (tests.u(1), tests.u(2), 'accepted'),
  (tests.u(1), tests.u(4), 'accepted');

-- 11. Clients cannot touch the invite table.
select ok(tests.denied('anon', 'select * from public.outing_invites'), 'anon cannot select outing_invites');
select ok(tests.denied('authenticated', 'select * from public.outing_invites'), 'authenticated cannot select outing_invites');
select ok(tests.denied('anon', 'insert into public.outing_invites default values'), 'anon cannot insert outing_invites');
select ok(tests.denied('authenticated', 'insert into public.outing_invites default values'), 'authenticated cannot insert outing_invites');
select ok(tests.denied('anon', 'update public.outing_invites set status = status'), 'anon cannot update outing_invites');
select ok(tests.denied('authenticated', 'update public.outing_invites set status = status'), 'authenticated cannot update outing_invites');
select ok(tests.denied('anon', 'delete from public.outing_invites'), 'anon cannot delete outing_invites');
select ok(tests.denied('authenticated', 'delete from public.outing_invites'), 'authenticated cannot delete outing_invites');

-- 1. A creates an outing. B does not see it.
set local role authenticated;
select tests.login(1);
select lives_ok(
  format(
    'select tests.save(%L, public.create_outing(%L, null, %L, -39.57::double precision, -71.79::double precision, %L::date, %L::date, null))',
    'first',
    'Termas Geométricas',
    'nominatim:way:281946924',
    tests.local_today('America/Santiago'),
    tests.local_today('America/Santiago')
  ),
  'A creates an outing this month');
select tests.login(2);
select ok(position(tests.g('first')::text in public.my_month()::text) = 0, 'B does not see the new outing in my_month');
select ok(position(tests.g('first')::text in public.my_map()::text) = 0, 'B does not see the new outing in my_map');

-- 2. Not a friend, and not yourself.
select tests.login(1);
select throws_ok(
  format('select public.invite_outing_companion(%L::uuid, %L::uuid)', tests.g('first'), tests.u(3)),
  'P0001', 'not_friend', 'C is not a friend');
select throws_ok(
  format('select public.invite_outing_companion(%L::uuid, %L::uuid)', tests.g('first'), tests.u(1)),
  'P0001', 'not_friend', 'A cannot invite A');

-- 3. A invites B. B still does not see the row. A sees pending and B's first name.
select lives_ok(
  format(
    'select tests.save(%L, public.invite_outing_companion(%L::uuid, %L::uuid))',
    'inv',
    tests.g('first'),
    tests.u(2)
  ),
  'A invites B');
select tests.login(2);
select ok(position(tests.g('first')::text in public.my_month()::text) = 0, 'a pending invite stays out of B month');
select tests.login(1);
select is(
  (
    select e->>'invite_status'
    from jsonb_array_elements(public.my_month() -> 'outings') e
    where e->>'id' = tests.g('first')::text
  ),
  'pending',
  'A sees the invite as pending');
select is(
  (
    select e->>'companion_name'
    from jsonb_array_elements(public.my_month() -> 'outings') e
    where e->>'id' = tests.g('first')::text
  ),
  'Sofía',
  'companion_name is the first name of B');

-- 4. A second open invite on the same outing.
select throws_ok(
  format('select public.invite_outing_companion(%L::uuid, %L::uuid)', tests.g('first'), tests.u(4)),
  'P0001', 'already_invited', 'one open invite per outing');

-- 5. B declines. The declined row is not a companion. A can invite D.
select tests.login(2);
select lives_ok(
  format('select public.respond_outing_invite(%L::uuid, false)', tests.g('inv')),
  'B declines');
select ok(position(tests.g('first')::text in public.my_month()::text) = 0, 'B still does not see the declined outing');
select tests.login(1);
select ok(
  (
    select e->>'invite_status'
    from jsonb_array_elements(public.my_month() -> 'outings') e
    where e->>'id' = tests.g('first')::text
  ) is null,
  'a declined invite is not shown as a companion');
select lives_ok(
  format('select public.invite_outing_companion(%L::uuid, %L::uuid)', tests.g('first'), tests.u(4)),
  'A can invite D after the decline');

-- 6 and 12. A new outing. While the invite is pending, B's invite does not leak A's private outing, and C receives null.
select lives_ok(
  format(
    'select tests.save(%L, public.create_outing(%L, null, %L, -39.27::double precision, -71.98::double precision, %L::date, %L::date, null))',
    'shared',
    'Compartida',
    'nominatim:node:2',
    tests.local_today('America/Santiago'),
    tests.local_today('America/Santiago')
  ),
  'A creates the shared outing');
select lives_ok(
  format(
    'select tests.save(%L, public.create_outing(%L, null, %L, -33.45::double precision, -70.66::double precision, %L::date, %L::date, null))',
    'private',
    'Privada',
    'nominatim:node:3',
    tests.local_today('America/Santiago'),
    tests.local_today('America/Santiago')
  ),
  'A creates a private outing');
select lives_ok(
  format(
    'select tests.save(%L, public.invite_outing_companion(%L::uuid, %L::uuid))',
    'shared_inv',
    tests.g('shared'),
    tests.u(2)
  ),
  'A invites B to the shared outing');
select tests.login(2);
select ok(public.my_outing_invite(tests.g('shared')) is not null, 'B can read the pending invite');
select ok(
  position(tests.g('private')::text in public.my_outing_invite(tests.g('shared'))::text) = 0,
  'the pending invite does not contain the private outing');
select tests.login(3);
select ok(public.my_outing_invite(tests.g('shared')) is null, 'C, who was not invited, receives null');

-- Accept. The json is the owner and the place, and it does not carry the floor.
select tests.login(2);
create temp table t_resp (j jsonb);
select lives_ok(
  format('insert into t_resp select public.respond_outing_invite(%L::uuid, true)', tests.g('shared_inv')),
  'B accepts');
select is((select j->>'owner_id' from t_resp), tests.u(1)::text, 'respond returns the owner');
select is((select j->>'place_name' from t_resp), 'Compartida', 'respond returns that place');
select ok(not (select j ? 'completed' from t_resp), 'respond does not contain completed');
select tests.login(1);
select ok(position(tests.g('shared')::text in public.my_month()::text) > 0, 'A sees the accepted outing');
select tests.login(2);
select ok(position(tests.g('shared')::text in public.my_month()::text) > 0, 'B sees the accepted outing');
select tests.login(1);
select is((public.my_month() ->> 'completed')::int, 0, 'A completed stays 0 before Fui');
select tests.login(2);
select is((public.my_month() ->> 'completed')::int, 0, 'B completed stays 0 before Fui');
select ok(position(tests.g('private')::text in public.my_month()::text) = 0, 'B does not see the other private outing');

-- 7. A marks Fui. Both floors count that one row. The pin is on both maps. B has no floor key and no other month.
select tests.login(1);
select lives_ok(
  format('select public.mark_outing_went(%L::uuid)', tests.g('shared')),
  'A marks the shared outing');
select is((public.my_month() ->> 'completed')::int, 1, 'A completed is 1');
select ok(position(tests.g('shared')::text in (public.my_map() -> 'pins')::text) > 0, 'the pin is on A map');
select tests.login(2);
select is((public.my_month() ->> 'completed')::int, 1, 'B completed is 1');
select ok(position(tests.g('shared')::text in (public.my_map() -> 'pins')::text) > 0, 'the pin is on B map');
select ok(not (public.my_month() ? 'floor'), 'B month has no floor key');
select ok(
  not exists (
    select 1
    from jsonb_array_elements(public.my_month() -> 'outings') e
    where (e->>'starts_on')::date < tests.local_month('America/Santiago')
       or (e->>'starts_on')::date >= (tests.local_month('America/Santiago') + interval '1 month')::date
  ),
  'B month has no outing from another month');

-- 8. Marking again does not move went_on.
reset role;
create temp table t_snap (went_on date);
insert into t_snap select went_on from public.outings where id = tests.g('shared');
set local role authenticated;
select tests.login(1);
select lives_ok(
  format('select public.mark_outing_went(%L::uuid)', tests.g('shared')),
  'marking again does not throw');
reset role;
select is(
  (select went_on from public.outings where id = tests.g('shared')),
  (select went_on from t_snap),
  'the second mark keeps went_on');

-- 9. An accepted plan from a previous month is inserted as postgres, then accepted.
insert into public.outings (
  id, owner_id, place_name, place_key, lat, lng, month_start, starts_on, ends_on, status
) values (
  'i3710000-0000-0000-0000-000000000090',
  tests.u(1),
  'Mes pasado',
  'nominatim:node:90',
  -33.45,
  -70.66,
  (tests.local_month('America/Santiago') - interval '1 month')::date,
  (tests.local_month('America/Santiago') - interval '1 month')::date,
  (tests.local_month('America/Santiago') - interval '1 month')::date,
  'planned'
);
insert into public.outing_invites (id, outing_id, invitee_id, status) values (
  'i3710000-0000-0000-0000-000000000091',
  'i3710000-0000-0000-0000-000000000090',
  tests.u(2),
  'pending'
);
set local role authenticated;
select tests.login(2);
select lives_ok(
  $$ select public.respond_outing_invite('i3710000-0000-0000-0000-000000000091', true) $$,
  'B accepts a plan from a closed month');
select tests.login(1);
select ok(
  position('i3710000-0000-0000-0000-000000000090' in (public.my_map() -> 'plans')::text) > 0,
  'the closed plan is in A plans');
select ok(
  position('i3710000-0000-0000-0000-000000000090' in (public.my_map() -> 'pins')::text) = 0,
  'the closed plan is not a pin for A');
select is((public.my_month() ->> 'completed')::int, 1, 'the closed plan does not raise A completed');
select tests.login(2);
select ok(
  position('i3710000-0000-0000-0000-000000000090' in (public.my_map() -> 'plans')::text) > 0,
  'the closed plan is in B plans');
select ok(
  position('i3710000-0000-0000-0000-000000000090' in (public.my_map() -> 'pins')::text) = 0,
  'the closed plan is not a pin for B');
select is((public.my_month() ->> 'completed')::int, 1, 'the closed plan does not raise B completed');

-- 10. B marks an accepted plan that is still planned this month.
select tests.login(1);
select lives_ok(
  format(
    'select tests.save(%L, public.create_outing(%L, null, %L, -41.47::double precision, -72.94::double precision, %L::date, %L::date, null))',
    'markable',
    'Marca',
    'nominatim:node:4',
    tests.local_today('America/Santiago'),
    tests.local_today('America/Santiago')
  ),
  'A creates an outing B will mark');
select lives_ok(
  format(
    'select tests.save(%L, public.invite_outing_companion(%L::uuid, %L::uuid))',
    'mark_inv',
    tests.g('markable'),
    tests.u(2)
  ),
  'A invites B to that outing');
select tests.login(2);
select lives_ok(
  format('select public.respond_outing_invite(%L::uuid, true)', tests.g('mark_inv')),
  'B accepts the outing to mark');
select lives_ok(
  format('select public.mark_outing_went(%L::uuid)', tests.g('markable')),
  'B marks Fui');
reset role;
select is((select status from public.outings where id = tests.g('markable')), 'went', 'B marking sets went');
set local role authenticated;
select tests.login(1);
select is(
  (
    select e->>'status'
    from jsonb_array_elements(public.my_month() -> 'outings') e
    where e->>'id' = tests.g('markable')::text
  ),
  'went',
  'A sees that outing as went');
select tests.login(2);
select is(
  (
    select e->>'status'
    from jsonb_array_elements(public.my_month() -> 'outings') e
    where e->>'id' = tests.g('markable')::text
  ),
  'went',
  'B sees that outing as went');

-- 13. Cancel a planned outing with a pending invite. A went outing stays closed.
select tests.login(1);
select lives_ok(
  format(
    'select tests.save(%L, public.create_outing(%L, null, %L, -36.82::double precision, -73.05::double precision, %L::date, %L::date, null))',
    'cancelme',
    'Cancelable',
    'nominatim:node:5',
    tests.local_today('America/Santiago'),
    tests.local_today('America/Santiago')
  ),
  'A creates an outing to cancel');
select lives_ok(
  format('select public.invite_outing_companion(%L::uuid, %L::uuid)', tests.g('cancelme'), tests.u(2)),
  'A invites B before cancelling');
create temp table t_cancel (j jsonb);
select lives_ok(
  format('insert into t_cancel select public.cancel_outing(%L::uuid)', tests.g('cancelme')),
  'A cancels the planned outing');
select is((select j->>'invitee_id' from t_cancel), tests.u(2)::text, 'cancel returns the pending invitee');
reset role;
select is((select count(*)::int from public.outings where id = tests.g('cancelme')), 0, 'the planned row is gone');
set local role authenticated;
select tests.login(1);
select throws_ok(
  format('select public.cancel_outing(%L::uuid)', tests.g('shared')),
  'P0001', 'outing_closed', 'a went outing cannot be cancelled');
reset role;
select is((select count(*)::int from public.outings where id = tests.g('shared')), 1, 'the went row stays');

-- Execute stays with authenticated.
select is((
  select bool_and(not has_function_privilege('anon', p, 'execute'))
  from unnest(array[
    'public.invite_outing_companion(uuid,uuid)',
    'public.respond_outing_invite(uuid,boolean)',
    'public.my_outing_invite(uuid)',
    'public.mark_outing_went(uuid)',
    'public.my_month()',
    'public.my_map()',
    'public.cancel_outing(uuid)'
  ]) p
), true, 'anon cannot execute the invite functions');
select is((
  select bool_and(has_function_privilege('authenticated', p, 'execute'))
  from unnest(array[
    'public.invite_outing_companion(uuid,uuid)',
    'public.respond_outing_invite(uuid,boolean)',
    'public.my_outing_invite(uuid)',
    'public.mark_outing_went(uuid)',
    'public.my_month()',
    'public.my_map()',
    'public.cancel_outing(uuid)'
  ]) p
), true, 'authenticated can execute the invite functions');

select * from finish();
rollback;
