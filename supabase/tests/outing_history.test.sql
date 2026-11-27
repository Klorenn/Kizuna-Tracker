begin;
-- Owner month index and repeat-as-planned. Own fixtures. Rolled back.
create extension if not exists pgtap with schema extensions;
select plan(28);

create schema tests;
create function tests.u(n int) returns uuid language sql immutable as $f$
  select ('i3900000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $f$;
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
create function tests.local_today(tz text) returns date language sql stable as $$
  select (now() at time zone tz)::date $$;
create function tests.local_month(tz text) returns date language sql stable as $$
  select date_trunc('month', (now() at time zone tz)::timestamp)::date $$;
grant usage on schema tests to authenticated, anon, service_role;
grant execute on all functions in schema tests to authenticated, anon, service_role;
grant select on tests.ctx to authenticated, anon;

insert into auth.users (id) select tests.u(g) from generate_series(1, 3) g;
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone)
select tests.u(g),
       'hist_' || lpad(g::text, 2, '0'),
       case g when 1 then 'Ana' when 2 then 'Sofía' else 'Carla' end,
       'Test',
       '1990-01-01',
       now(),
       'America/Santiago'
from generate_series(1, 3) g;
insert into public.friendships (requester_id, addressee_id, status) values
  (tests.u(1), tests.u(2), 'accepted'),
  (tests.u(1), tests.u(3), 'accepted');

insert into public.trips (id, owner_id, name) values (tests.u(92), tests.u(1), 'Viejo');
insert into public.outings (
  id, owner_id, place_name, place_key, lat, lng, month_start, starts_on, ends_on, status, went_on
) values
  (
    tests.u(80), tests.u(1), 'Octubre uno', 'nominatim:node:80',
    -39.27, -71.98,
    (tests.local_month('America/Santiago') - interval '1 month')::date,
    (tests.local_month('America/Santiago') - interval '1 month')::date,
    (tests.local_month('America/Santiago') - interval '1 month')::date,
    'went',
    (tests.local_month('America/Santiago') - interval '1 month')::date
  ),
  (
    tests.u(81), tests.u(1), 'Octubre dos', 'nominatim:node:81',
    -39.28, -71.99,
    (tests.local_month('America/Santiago') - interval '1 month')::date,
    (tests.local_month('America/Santiago') - interval '1 month')::date,
    (tests.local_month('America/Santiago') - interval '1 month')::date,
    'went',
    (tests.local_month('America/Santiago') - interval '1 month')::date
  ),
  (
    tests.u(91), tests.u(1), 'Enero', 'nominatim:node:91',
    -33.0, -71.0,
    '2026-01-01', '2026-01-31', '2026-01-31', 'went', '2026-01-31'
  );
update public.outings
set trip_id = tests.u(92),
    photo_path = tests.u(1)::text || '/' || tests.u(91)::text || '.jpg',
    note = 'nota'
where id = tests.u(91);

set local role authenticated;
select tests.login(1);
select lives_ok(
  format(
    'select tests.save(%L, public.create_outing(%L, null, %L, -39.57::double precision, -71.79::double precision, %L::date, %L::date, %L))',
    'now', 'Termas Geométricas', 'nominatim:way:281946924',
    tests.local_today('America/Santiago'), tests.local_today('America/Santiago'), '  volver  '
  ),
  'A plans the current month');
select is(
  (select count(*) from jsonb_array_elements(public.my_month_index()))::int,
  3,
  'owned months are November-or-current, October, and January');
select is(
  (
    select (e->>'completed')::int
    from jsonb_array_elements(public.my_month_index()) e
    where e->>'month_start' = tests.local_month('America/Santiago')::text
  ),
  0,
  'the current month can sit at 0');
select is(
  (
    select (e->>'completed')::int
    from jsonb_array_elements(public.my_month_index()) e
    where e->>'month_start' = (tests.local_month('America/Santiago') - interval '1 month')::date::text
  ),
  2,
  'October counts two visits');
select ok(
  position(((tests.local_month('America/Santiago') - interval '2 month')::date)::text in public.my_month_index()::text) = 0,
  'a month with no outings is not invented');

select tests.login(2);
select ok(
  position(((tests.local_month('America/Santiago') - interval '1 month')::date)::text in public.my_month_index()::text) = 0,
  'B does not see A private month');
select is(public.my_month_index()::text, '[]', 'B has no owned months');

select tests.login(1);
select lives_ok(
  format('select tests.save(%L, public.invite_outing_companion(%L::uuid, %L::uuid))', 'inv', tests.g('now'), tests.u(3)),
  'A invites C');
select tests.login(3);
select lives_ok(format('select public.respond_outing_invite(%L::uuid, true)', tests.g('inv')), 'C accepts');
select is(public.my_month_index()::text, '[]', 'an accepted plan is not C owned month');

select tests.login(1);
select lives_ok(format('select public.mark_outing_went(%L::uuid)', tests.g('now')), 'A marks Fui');
select lives_ok(
  format('select tests.save(%L, public.repeat_outing(%L::uuid))', 'copy', tests.g('now')),
  'repeat creates a draft');
select lives_ok(
  format('select tests.save(%L, public.repeat_outing(%L::uuid))', 'copy2', tests.g('now')),
  'a second repeat is another draft');

reset role;
select is((select status from public.outings where id = tests.g('now')), 'went', 'the original stays went');
select is((select status from public.outings where id = tests.g('copy')), 'planned', 'the copy is planned');
select is((select went_on from public.outings where id = tests.g('copy')), null, 'Fui is not copied');
select is((select trip_id from public.outings where id = tests.g('copy')), null, 'the trip is not copied');
select is((select photo_path from public.outings where id = tests.g('copy')), null, 'the photo is not copied');
select is((select note from public.outings where id = tests.g('copy')), 'volver', 'the note is copied trimmed');
select is(
  (select count(*) from public.outing_invites where outing_id = tests.g('copy'))::int,
  0,
  'the invitation is not copied');
select is(
  (select count(*) from public.outings where owner_id = tests.u(1) and place_key = 'nominatim:way:281946924')::int,
  3,
  'each repeat is a new row');
select is((select starts_on from public.outings where id = tests.g('copy2')), (select starts_on from public.outings where id = tests.g('copy')), 'both drafts land on the same shifted day');

set local role authenticated;
select tests.login(1);
select lives_ok(format('select tests.save(%L, public.repeat_outing(%L::uuid))', 'jan', tests.u(91)), '31 January repeats');
reset role;
select is((select starts_on from public.outings where id = tests.g('jan')), '2026-02-28'::date, '31 January becomes 28 February');
select is((select status from public.outings where id = tests.u(91)), 'went', 'the January row stays went');
select is((select trip_id from public.outings where id = tests.g('jan')), null, 'the January copy drops the trip');
select is((select photo_path from public.outings where id = tests.g('jan')), null, 'the January copy drops the photo');
set local role authenticated;
select tests.login(2);
select throws_ok(
  format('select public.repeat_outing(%L::uuid)', tests.g('now')),
  'P0001', 'not_found', 'B cannot repeat A outing'
);

select * from finish();
rollback;
