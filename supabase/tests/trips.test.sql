begin;
-- Trips are not groups. Own fixtures. Rolled back.
create extension if not exists pgtap with schema extensions;
select plan(34);

create schema tests;
create function tests.u(n int) returns uuid language sql immutable as $f$
  select ('i3800000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $f$;
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
create function tests.trip_stops(trip uuid) returns int language sql security definer set search_path = '' as $$
  select count(*)::int from public.outings where trip_id = $1 $$;
create function tests.outing_trip(id uuid) returns uuid language sql security definer set search_path = '' as $$
  select trip_id from public.outings where id = $1 $$;
create function tests.outing_month(id uuid) returns date language sql security definer set search_path = '' as $$
  select month_start from public.outings where id = $1 $$;
grant usage on schema tests to authenticated, anon, service_role;
grant execute on all functions in schema tests to authenticated, anon, service_role;
grant select on tests.ctx to authenticated, anon;

insert into auth.users (id) select tests.u(g) from generate_series(1, 3) g;
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone)
select tests.u(g),
       'trip_' || lpad(g::text, 2, '0'),
       case g when 1 then 'Ana' when 2 then 'Sofía' else 'Carla' end,
       'Test',
       '1990-01-01',
       now(),
       'America/Santiago'
from generate_series(1, 3) g;
insert into public.friendships (requester_id, addressee_id, status)
values (tests.u(1), tests.u(3), 'accepted');

select ok(tests.denied('anon', 'select * from public.trips'), 'anon cannot select trips');
select ok(tests.denied('authenticated', 'select * from public.trips'), 'authenticated cannot select trips');
select ok(tests.denied('anon', 'insert into public.trips default values'), 'anon cannot insert trips');
select ok(tests.denied('authenticated', 'insert into public.trips default values'), 'authenticated cannot insert trips');
select ok(tests.denied('authenticated', 'update public.trips set name = name'), 'authenticated cannot update trips');
select ok(tests.denied('authenticated', 'delete from public.trips'), 'authenticated cannot delete trips');

set local role authenticated;
select tests.login(1);
select lives_ok(
  format(
    'select tests.save(%L, public.create_outing(%L, null, %L, -39.57::double precision, -71.79::double precision, %L::date, %L::date, null))',
    'one', 'Termas Geométricas', 'nominatim:way:281946924',
    tests.local_today('America/Santiago'), tests.local_today('America/Santiago')
  ),
  'A creates the first stop');
select lives_ok(
  format(
    'select tests.save(%L, public.create_outing(%L, null, %L, -39.27::double precision, -71.98::double precision, %L::date, %L::date, null))',
    'two', 'Pucón', 'nominatim:node:2',
    tests.local_today('America/Santiago'), tests.local_today('America/Santiago')
  ),
  'A creates the second stop');
select lives_ok(
  format(
    'select tests.save(%L, public.create_trip(%L, array[%L, %L]::uuid[]))',
    'trip', 'Lagos', tests.g('one'), tests.g('two')
  ),
  'two own outings become a trip');
select is(tests.trip_stops(tests.g('trip')), 2, 'both stops point at the trip');

select tests.login(2);
select lives_ok(
  format(
    'select tests.save(%L, public.create_outing(%L, null, %L, -33.45::double precision, -70.66::double precision, %L::date, %L::date, null))',
    'foreign', 'Ajena', 'nominatim:node:9',
    tests.local_today('America/Santiago'), tests.local_today('America/Santiago')
  ),
  'B creates a private outing');
select tests.login(1);
select lives_ok(
  format(
    'select tests.save(%L, public.create_outing(%L, null, %L, -41.10::double precision, -73.00::double precision, %L::date, %L::date, null))',
    'loose', 'Suelta', 'nominatim:node:8',
    tests.local_today('America/Santiago'), tests.local_today('America/Santiago')
  ),
  'A has another outing');
select throws_ok(
  format('select public.create_trip(%L, array[%L, %L]::uuid[])', 'Robo', tests.g('loose'), tests.g('foreign')),
  'P0001', 'not_found', 'A cannot put B outing on a trip');
select ok(tests.outing_trip(tests.g('loose')) is null, 'the failed trip leaves A outing unattached');
select throws_ok(
  format('select public.create_trip(%L, array[%L]::uuid[])', 'Corto', tests.g('loose')),
  'P0001', 'trip_needs_two', 'a trip needs two stops');

select lives_ok(
  format(
    'select public.add_trip_stop(%L::uuid, %L, null, %L, -39.80::double precision, -73.24::double precision, %L::date, %L::date, null)',
    tests.g('trip'), 'Valdivia', 'nominatim:node:3',
    tests.local_today('America/Santiago'), tests.local_today('America/Santiago')
  ),
  'a stop in the current month is allowed');
select throws_ok(
  format(
    'select public.add_trip_stop(%L::uuid, %L, null, %L, -45.57::double precision, -72.07::double precision, %L::date, %L::date, null)',
    tests.g('trip'), 'Lejos', 'nominatim:node:4',
    (tests.local_month('America/Santiago') - interval '2 month')::date,
    (tests.local_month('America/Santiago') - interval '2 month')::date
  ),
  'P0001', 'stop_month', 'a month the trip does not already touch is refused');

reset role;
insert into public.outings (
  id, owner_id, place_name, place_key, lat, lng, month_start, starts_on, ends_on, status
) values (
  tests.u(70), tests.u(1), 'Mes anterior', 'nominatim:node:70',
  -39.8, -73.2,
  (tests.local_month('America/Santiago') - interval '1 month')::date,
  (tests.local_month('America/Santiago') - interval '1 month')::date,
  (tests.local_month('America/Santiago') - interval '1 month')::date,
  'planned'
);
set local role authenticated;
select tests.login(1);
select lives_ok(
  format(
    'select tests.save(%L, public.create_outing(%L, null, %L, -36.80::double precision, -73.05::double precision, %L::date, %L::date, null))',
    'now', 'Ahora', 'nominatim:node:71',
    tests.local_today('America/Santiago'), tests.local_today('America/Santiago')
  ),
  'A creates the current half of a cross-month trip');
select lives_ok(
  format('select tests.save(%L, public.create_trip(%L, array[%L, %L]::uuid[]))', 'span', 'Cruce', tests.u(70), tests.g('now')),
  'a trip can join two months the owner already has');
select lives_ok(
  format(
    'select tests.save(%L, public.add_trip_stop(%L::uuid, %L, null, %L, -39.80::double precision, -73.20::double precision, %L::date, %L::date, null))',
    'again', tests.g('span'), 'Otra vez', 'nominatim:node:72',
    (tests.local_month('America/Santiago') - interval '1 month')::date + 9,
    (tests.local_month('America/Santiago') - interval '1 month')::date + 9
  ),
  'another stop may use a month the trip already touches');
select is(
  tests.outing_month(tests.g('again')),
  (tests.local_month('America/Santiago') - interval '1 month')::date,
  'that stop keeps the earlier month');

select lives_ok(
  format('select tests.save(%L, public.invite_outing_companion(%L::uuid, %L::uuid))', 'inv', tests.g('one'), tests.u(3)),
  'A invites C to one stop');
select tests.login(3);
select lives_ok(
  format('select public.respond_outing_invite(%L::uuid, true)', tests.g('inv')),
  'C accepts that stop');
select ok(position(tests.g('one')::text in public.my_trips()::text) > 0, 'C sees the accepted stop');
select ok(position(tests.g('two')::text in public.my_trips()::text) = 0, 'C does not see the other stop');
select ok(position('Lagos' in public.my_trips()::text) > 0, 'C sees the trip name');
select tests.login(1);
select ok(position(tests.g('one')::text in public.my_trips()::text) > 0, 'the owner sees the first stop');
select ok(position(tests.g('two')::text in public.my_trips()::text) > 0, 'the owner sees the second stop');

select ok(
  not exists (
    select 1
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname in ('trips', 'outings')
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) ilike '%groups%'
  ),
  'no foreign key points at groups');

reset role;
delete from public.trips where id = tests.g('trip');
select is(
  (select count(*) from public.outings where id in (tests.g('one'), tests.g('two')) and trip_id is null)::int,
  2,
  'deleting the trip leaves the outings');

select ok(has_function_privilege('authenticated', 'public.create_trip(text, uuid[])', 'execute'), 'authenticated can create a trip');
select ok(not has_function_privilege('anon', 'public.create_trip(text, uuid[])', 'execute'), 'anon cannot create a trip');
select ok(has_function_privilege('authenticated', 'public.my_trips()', 'execute'), 'authenticated can read trips');
select ok(not has_function_privilege('anon', 'public.add_trip_stop(uuid, text, text, text, double precision, double precision, date, date, text)', 'execute'), 'anon cannot add a stop');

select * from finish();
rollback;
