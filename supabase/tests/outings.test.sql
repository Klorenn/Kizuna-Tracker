begin;
-- Outings (phase 1). Own fixtures. Rolled back. These rows are not groups.
create extension if not exists pgtap with schema extensions;
select plan(48);

create schema tests;
create function tests.u(n int) returns uuid language sql immutable as $f$
  select ('o3600000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $f$;
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

insert into auth.users (id) select tests.u(g) from generate_series(1, 10) g;
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone, deleted_at)
select tests.u(g),
       'out_' || lpad(g::text, 2, '0'),
       'U' || g,
       'Test',
       '1990-01-01',
       now(),
       case when g = 5 then 'Pacific/Kiritimati' else 'America/Santiago' end,
       case when g = 10 then now() end
from generate_series(1, 10) g;

-- 1–8. Clients cannot touch the table.
select ok(tests.denied('anon', 'select * from public.outings'), 'anon cannot select outings');
select ok(tests.denied('authenticated', 'select * from public.outings'), 'authenticated cannot select outings');
select ok(tests.denied('anon', 'insert into public.outings default values'), 'anon cannot insert outings');
select ok(tests.denied('authenticated', 'insert into public.outings default values'), 'authenticated cannot insert outings');
select ok(tests.denied('anon', 'update public.outings set place_name = place_name'), 'anon cannot update outings');
select ok(tests.denied('authenticated', 'update public.outings set place_name = place_name'), 'authenticated cannot update outings');
select ok(tests.denied('anon', 'delete from public.outings'), 'anon cannot delete outings');
select ok(tests.denied('authenticated', 'delete from public.outings'), 'authenticated cannot delete outings');

-- 2. No session.
set local role authenticated;
select tests.nosession();
select throws_ok(
  $$ select public.create_outing('Termas Geométricas', 'Coñaripe', 'nominatim:way:281946924', -39.5735, -71.7892, current_date, current_date, null) $$,
  '28000', 'not_authenticated', 'create_outing without a session');
select throws_ok(
  $$ select public.my_month() $$,
  '28000', 'not_authenticated', 'my_month without a session');

-- 3. First outing lands in the caller's current month, still planned.
select tests.login(1);
select lives_ok(
  $$ select tests.save('first', public.create_outing('Termas Geométricas', 'Coñaripe', 'nominatim:way:281946924', -39.5735, -71.7892, tests.local_today('America/Santiago'), tests.local_today('America/Santiago'), '  ')) $$,
  'create_outing returns a uuid');
reset role;
select is((select month_start from public.outings where id = tests.g('first')), tests.local_month('America/Santiago'), 'month_start is the Santiago month');
select is((select status from public.outings where id = tests.g('first')), 'planned', 'a new outing is planned');
select is((select note from public.outings where id = tests.g('first')), null, 'a blank note is stored as null');
select is((select went_on from public.outings where id = tests.g('first')), null, 'planned has no went_on');

-- 4. The same place is a new row. Marking the first does not delete the second.
set local role authenticated;
select tests.login(1);
select lives_ok(
  $$ select tests.save('second', public.create_outing('Termas Geométricas', 'Coñaripe', 'nominatim:way:281946924', -39.5735, -71.7892, tests.local_today('America/Santiago'), tests.local_today('America/Santiago'), null)) $$,
  'the same place key creates another row');
reset role;
select is(
  (select count(*)::int from public.outings where owner_id = tests.u(1) and place_key = 'nominatim:way:281946924'),
  2,
  'two rows share the place key');
set local role authenticated;
select tests.login(1);
select lives_ok(
  format('select public.mark_outing_went(%L::uuid)', tests.g('first')),
  'the owner marks the first outing');
reset role;
select is(
  (select count(*)::int from public.outings where owner_id = tests.u(1) and place_key = 'nominatim:way:281946924'),
  2,
  'marking the first leaves the second row');

-- 5. went_on is the local day, and a second mark does not move it.
select is((select status from public.outings where id = tests.g('first')), 'went', 'the first outing is went');
select is((select went_on from public.outings where id = tests.g('first')), tests.local_today('America/Santiago'), 'went_on is the Santiago day');
create temp table t_snap (went_on date);
insert into t_snap select went_on from public.outings where id = tests.g('first');
set local role authenticated;
select tests.login(1);
select lives_ok(
  format('select public.mark_outing_went(%L::uuid)', tests.g('first')),
  'marking again does not throw');
reset role;
select is(
  (select went_on from public.outings where id = tests.g('first')),
  (select went_on from t_snap),
  'the second mark keeps went_on');

-- 6. A previous month cannot be marked.
insert into public.outings (
  id, owner_id, place_name, place_detail, place_key, lat, lng, month_start, starts_on, ends_on, status
) values (
  'o3610000-0000-0000-0000-000000000006',
  tests.u(1),
  'Mes pasado',
  null,
  'nominatim:node:1',
  -33.45,
  -70.66,
  (tests.local_month('America/Santiago') - interval '1 month')::date,
  (tests.local_month('America/Santiago') - interval '1 month')::date,
  (tests.local_month('America/Santiago') - interval '1 month')::date,
  'planned'
);
set local role authenticated;
select tests.login(1);
select throws_ok(
  $$ select public.mark_outing_went('o3610000-0000-0000-0000-000000000006') $$,
  'P0001', 'month_closed', 'a closed month cannot be marked');
reset role;
select is(
  (select status from public.outings where id = 'o3610000-0000-0000-0000-000000000006'),
  'planned',
  'the closed month stays planned');

-- 7. Before starts_on. On the last day of the month the domain test covers this.
do $do$
begin
  if tests.local_today('America/Santiago') < ((tests.local_month('America/Santiago') + interval '1 month')::date - 1) then
    insert into public.outings (
      id, owner_id, place_name, place_key, lat, lng, month_start, starts_on, ends_on, status
    ) values (
      'o3610000-0000-0000-0000-000000000070',
      tests.u(1),
      'Mañana',
      'nominatim:node:2',
      -33.45,
      -70.66,
      tests.local_month('America/Santiago'),
      tests.local_today('America/Santiago') + 1,
      tests.local_today('America/Santiago') + 1,
      'planned'
    );
  end if;
end
$do$;
set local role authenticated;
select tests.login(1);
select case
  when tests.local_today('America/Santiago') < ((tests.local_month('America/Santiago') + interval '1 month')::date - 1)
  then throws_ok(
    $$ select public.mark_outing_went('o3610000-0000-0000-0000-000000000070') $$,
    'P0001', 'too_early', 'cannot mark before starts_on')
  else pass('too_early queda cubierto en tests/domain/outings.test.ts')
end;

-- 8. Bad dates, place key, and note.
select throws_ok(
  format(
    'select public.create_outing(%L, null, %L, -39.5::double precision, -71.7::double precision, %L::date, %L::date, null)',
    'Termas',
    'nominatim:way:1',
    (tests.local_month('America/Santiago') + interval '1 month')::date,
    (tests.local_month('America/Santiago') + interval '1 month')::date
  ),
  'P0001', 'invalid_dates', 'dates outside the current month');
select throws_ok(
  format(
    'select public.create_outing(%L, null, %L, -39.5::double precision, -71.7::double precision, %L::date, %L::date, null)',
    'Termas',
    'groups:1',
    tests.local_today('America/Santiago'),
    tests.local_today('America/Santiago')
  ),
  'P0001', 'invalid_place', 'a group key is not a place');
select throws_ok(
  format(
    'select public.create_outing(%L, null, %L, -39.5::double precision, -71.7::double precision, %L::date, %L::date, %L)',
    'Termas',
    'nominatim:way:1',
    tests.local_today('America/Santiago'),
    tests.local_today('America/Santiago'),
    repeat('a', 281)
  ),
  'P0001', 'invalid_note', 'a note of 281 characters');

-- 9. The month read is only this month. The map has the pin and no plans.
reset role;
create temp table t_expect (completed int);
insert into t_expect
select count(*)::int from public.outings
where owner_id = tests.u(1)
  and month_start = tests.local_month('America/Santiago')
  and status = 'went';
grant all on t_expect to authenticated, anon, service_role;
set local role authenticated;
select tests.login(1);
select is(
  (public.my_month() ->> 'completed')::int,
  (select completed from t_expect),
  'completed counts went rows of this month');
select ok(
  position('o3610000-0000-0000-0000-000000000006' in public.my_month()::text) = 0,
  'my_month omits the previous month');
select ok(
  position(tests.g('first')::text in public.my_map()::text) > 0,
  'my_map includes the went pin');
select is(public.my_map() -> 'plans', '[]'::jsonb, 'plans stay empty in phase 1');

-- 10. Someone else sees none of it.
select tests.login(2);
select is((public.my_month() ->> 'completed')::int, 0, 'user 2 has no completed outings');
select is(public.my_month() -> 'outings', '[]'::jsonb, 'user 2 has no outings this month');
select ok(
  position(tests.g('first')::text in public.my_map()::text) = 0,
  'user 2 does not see user 1 pin');

-- 11. Kiritimati stores its own month.
select tests.login(5);
select lives_ok(
  $$ select tests.save('kiri', public.create_outing('Pucón', null, 'nominatim:node:9', -39.27, -71.98, tests.local_today('Pacific/Kiritimati'), tests.local_today('Pacific/Kiritimati'), null)) $$,
  'user 5 creates an outing on the Kiritimati day');
reset role;
select is(
  (select month_start from public.outings where id = tests.g('kiri')),
  tests.local_month('Pacific/Kiritimati'),
  'month_start follows Pacific/Kiritimati, not a client month');

-- 13 then 12. Update while the planned row still exists, then cancel.
set local role authenticated;
select tests.login(1);
select lives_ok(
  format(
    'select public.update_outing(%L::uuid, %L, %L, %L, -39.27::double precision, -71.98::double precision, %L::date, %L::date, %L)',
    tests.g('second'),
    'Pucón',
    'Araucanía',
    'nominatim:node:42',
    tests.local_today('America/Santiago'),
    tests.local_today('America/Santiago'),
    'nota'
  ),
  'the owner updates a planned outing');
reset role;
select is((select place_name from public.outings where id = tests.g('second')), 'Pucón', 'the planned name changes');
set local role authenticated;
select tests.login(1);
select throws_ok(
  format(
    'select public.update_outing(%L::uuid, %L, null, %L, -39.27::double precision, -71.98::double precision, %L::date, %L::date, null)',
    tests.g('first'),
    'Nada',
    'nominatim:node:1',
    tests.local_today('America/Santiago'),
    tests.local_today('America/Santiago')
  ),
  'P0001', 'outing_closed', 'a went outing cannot be edited');
select lives_ok(
  format('select public.cancel_outing(%L::uuid)', tests.g('second')),
  'the owner cancels a planned outing');
reset role;
select is((select count(*)::int from public.outings where id = tests.g('second')), 0, 'the planned row is gone');
set local role authenticated;
select tests.login(1);
select throws_ok(
  format('select public.cancel_outing(%L::uuid)', tests.g('first')),
  'P0001', 'outing_closed', 'a went outing cannot be cancelled');
reset role;
select is((select count(*)::int from public.outings where id = tests.g('first')), 1, 'the went row stays');

-- 14. A deleted profile.
set local role authenticated;
select tests.login(10);
select throws_ok(
  format(
    'select public.create_outing(%L, null, %L, -39.5::double precision, -71.7::double precision, %L::date, %L::date, null)',
    'Termas',
    'nominatim:way:9',
    tests.local_today('America/Santiago'),
    tests.local_today('America/Santiago')
  ),
  '28000', 'not_authenticated', 'a deleted profile cannot create an outing');

-- 15. Execute grants.
reset role;
select is((
  select bool_and(not has_function_privilege('anon', p, 'execute'))
  from unnest(array[
    'public.create_outing(text,text,text,double precision,double precision,date,date,text)',
    'public.update_outing(uuid,text,text,text,double precision,double precision,date,date,text)',
    'public.mark_outing_went(uuid)',
    'public.cancel_outing(uuid)',
    'public.my_month()',
    'public.my_map()'
  ]) p
), true, 'anon cannot execute the six functions');
select is((
  select bool_and(has_function_privilege('authenticated', p, 'execute'))
  from unnest(array[
    'public.create_outing(text,text,text,double precision,double precision,date,date,text)',
    'public.update_outing(uuid,text,text,text,double precision,double precision,date,date,text)',
    'public.mark_outing_went(uuid)',
    'public.cancel_outing(uuid)',
    'public.my_month()',
    'public.my_map()'
  ]) p
), true, 'authenticated can execute the six functions');

select * from finish();
rollback;
