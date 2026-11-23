begin;
-- Read RPCs friend_feed and checkin_dates (0019). They are SECURITY INVOKER, so RLS keeps deciding
-- visibility. Every "oracle" assertion compares the RPC with the same read made straight on the
-- tables under the same role: the RPC must show exactly what the tables showed before.
truncate public.profiles cascade;
delete from auth.users where email like '%@example.com';
create extension if not exists pgtap with schema extensions;
select plan(61);

-- A viewer, B accepted friend, C pending requester, S stranger, D deleted accepted friend
insert into auth.users (id) values
  ('a0000000-0000-0000-0000-0000000000a1'),
  ('a0000000-0000-0000-0000-0000000000b2'),
  ('a0000000-0000-0000-0000-0000000000c3'),
  ('a0000000-0000-0000-0000-0000000000d4'),
  ('a0000000-0000-0000-0000-0000000000e5');
insert into public.profiles (id, username, first_name, last_name, birth_date, terms_accepted_at, timezone) values
  ('a0000000-0000-0000-0000-0000000000a1', 'user_a', 'A', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a0000000-0000-0000-0000-0000000000b2', 'user_b', 'B', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a0000000-0000-0000-0000-0000000000c3', 'user_c', 'C', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a0000000-0000-0000-0000-0000000000d4', 'user_s', 'S', 'Test', '1990-01-01', now(), 'America/Santiago'),
  ('a0000000-0000-0000-0000-0000000000e5', 'user_d', 'D', 'Test', '1990-01-01', now(), 'America/Santiago');
insert into public.friendships (requester_id, addressee_id, status) values
  ('a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000b2', 'accepted'),
  ('a0000000-0000-0000-0000-0000000000c3', 'a0000000-0000-0000-0000-0000000000a1', 'pending'),
  ('a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000e5', 'accepted');
insert into public.habits (id, user_id, name, icon, frequency_type, requires_photo, visibility) values
  ('b0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a1', 'Mio', 'book', 'daily', false, 'friends'),
  ('b0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000b2', 'Leer', 'book', 'daily', false, 'public'),
  ('b0000000-0000-0000-0000-0000000000b2', 'a0000000-0000-0000-0000-0000000000b2', 'Gimnasio', 'barbell', 'weekly', false, 'friends'),
  ('b0000000-0000-0000-0000-0000000000b3', 'a0000000-0000-0000-0000-0000000000b2', 'Diario', 'moon', 'daily', false, 'private'),
  ('b0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000c3', 'De C', 'book', 'daily', false, 'public'),
  ('b0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d4', 'De S', 'book', 'daily', false, 'public'),
  ('b0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000e5', 'De D', 'book', 'daily', false, 'public');
-- the deleted profile (soft delete) keeps its rows and its friendship, as today
update public.profiles set deleted_at = now() where id = 'a0000000-0000-0000-0000-0000000000e5';

-- fixed created_at so the feed order is deterministic; one photo, one rejected by A, one rejected by S
insert into public.checkins (id, habit_id, user_id, local_date, photo_path, created_at) values
  ('d0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a1', current_date - 1, null, now() - interval '1 day'),
  ('d0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a1', current_date - 2, null, now() - interval '2 days'),
  ('d0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000b2', current_date - 1,
     'a0000000-0000-0000-0000-0000000000b2/d0000000-0000-0000-0000-0000000000b1.jpg', now() - interval '1 day'),
  ('d0000000-0000-0000-0000-0000000000b2', 'b0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000b2', current_date - 2, null, now() - interval '2 days'),
  ('d0000000-0000-0000-0000-0000000000b3', 'b0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000b2', current_date - 3, null, now() - interval '3 days'),
  ('d0000000-0000-0000-0000-0000000000b4', 'b0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000b2', current_date - 4, null, now() - interval '4 days'),
  ('d0000000-0000-0000-0000-0000000000b5', 'b0000000-0000-0000-0000-0000000000b3', 'a0000000-0000-0000-0000-0000000000b2', current_date - 1, null, now() - interval '1 day'),
  ('d0000000-0000-0000-0000-0000000000b6', 'b0000000-0000-0000-0000-0000000000b2', 'a0000000-0000-0000-0000-0000000000b2', current_date - 1, null, now() - interval '23 hours'),
  ('d0000000-0000-0000-0000-0000000000c1', 'b0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000c3', current_date - 1, null, now() - interval '1 day'),
  ('d0000000-0000-0000-0000-0000000000d1', 'b0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000d4', current_date - 1, null, now() - interval '1 day'),
  ('d0000000-0000-0000-0000-0000000000e1', 'b0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000e5', current_date - 1, null, now() - interval '1 day');
update public.habits set color = 'rosa' where id = 'b0000000-0000-0000-0000-0000000000b2';
-- b7: duplicate photo on a public habit; b8: photo on the private habit; b9: photo rejected by the stranger
insert into public.checkins (id, habit_id, user_id, local_date, photo_path, photo_sha256, is_duplicate, created_at) values
  ('d0000000-0000-0000-0000-0000000000b7', 'b0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000b2', current_date - 5,
     'a0000000-0000-0000-0000-0000000000b2/d0000000-0000-0000-0000-0000000000b7.jpg', 'same-hash', true, now() - interval '5 days'),
  ('d0000000-0000-0000-0000-0000000000b8', 'b0000000-0000-0000-0000-0000000000b3', 'a0000000-0000-0000-0000-0000000000b2', current_date - 6,
     'a0000000-0000-0000-0000-0000000000b2/d0000000-0000-0000-0000-0000000000b8.jpg', 'other-hash', false, now() - interval '6 days'),
  ('d0000000-0000-0000-0000-0000000000b9', 'b0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000b2', current_date - 7,
     'a0000000-0000-0000-0000-0000000000b2/d0000000-0000-0000-0000-0000000000b9.jpg', 'third-hash', false, now() - interval '7 days');
update public.checkins set rejected_at = now(), rejected_by = 'a0000000-0000-0000-0000-0000000000d4', reject_reason = 'unclear'
  where id = 'd0000000-0000-0000-0000-0000000000b9';
update public.checkins set rejected_at = now(), rejected_by = 'a0000000-0000-0000-0000-0000000000a1', reject_reason = 'unclear'
  where id = 'd0000000-0000-0000-0000-0000000000b3';
update public.checkins set rejected_at = now(), rejected_by = 'a0000000-0000-0000-0000-0000000000d4', reject_reason = 'unclear'
  where id = 'd0000000-0000-0000-0000-0000000000b4';
update public.checkins set rejected_at = now(), rejected_by = 'a0000000-0000-0000-0000-0000000000b2', reject_reason = 'unclear'
  where id = 'd0000000-0000-0000-0000-0000000000a2';

-- ===== anon: no access at all =====
set local role anon;
select throws_ok($$ select * from public.friend_feed(20) $$, '42501', null, 'anon cannot call friend_feed');
select throws_ok($$ select * from public.checkin_dates(array['b0000000-0000-0000-0000-0000000000b1']::uuid[], '2000-01-01') $$,
  '42501', null, 'anon cannot call checkin_dates');
reset role;

select ok((select not has_function_privilege('anon', 'public.friend_feed(int,date,timestamptz,uuid,boolean,uuid)', 'execute')),
  'friend_feed: no EXECUTE for anon');
select ok(not exists (select 1 from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name in ('friend_feed', 'checkin_dates') and grantee in ('PUBLIC', 'anon')),
  'neither RPC is granted to PUBLIC or anon');
select ok((select has_function_privilege('authenticated', 'public.checkin_dates(uuid[],date)', 'execute')),
  'checkin_dates: EXECUTE for authenticated');
select ok((select not p.prosecdef and p.provolatile = 's' and p.proconfig = array['search_path=""']
    from pg_proc p where p.oid = 'public.friend_feed(int,date,timestamptz,uuid,boolean,uuid)'::regprocedure),
  'friend_feed: SECURITY INVOKER, STABLE, search_path pinned');
select ok((select not p.prosecdef and p.provolatile = 's' and p.proconfig = array['search_path=""']
    from pg_proc p where p.oid = 'public.checkin_dates(uuid[],date)'::regprocedure),
  'checkin_dates: SECURITY INVOKER, STABLE, search_path pinned');

-- ===== A (viewer): feed =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select is(array(select id from public.friend_feed(50)),
  array(select c.id from public.checkins c
        where c.user_id <> 'a0000000-0000-0000-0000-0000000000a1'
          and (c.rejected_at is null or c.rejected_by = 'a0000000-0000-0000-0000-0000000000a1')
        order by c.local_date desc, c.created_at desc, c.id desc),
  'A feed = what the tables showed (RLS + rejected rule + neq me)');
select is(array(select id from public.friend_feed(50)),
  array['d0000000-0000-0000-0000-0000000000b6', 'd0000000-0000-0000-0000-0000000000e1', 'd0000000-0000-0000-0000-0000000000b1',
        'd0000000-0000-0000-0000-0000000000b2', 'd0000000-0000-0000-0000-0000000000b3', 'd0000000-0000-0000-0000-0000000000b7']::uuid[],
  'A feed: B public/friends rows, the deleted friend, the row A rejected and the duplicate photo; in feed order');
select is((select count(*)::int from public.friend_feed(50) where id = 'd0000000-0000-0000-0000-0000000000b5'), 0,
  'A feed: B private habit never appears');
select is((select count(*)::int from public.friend_feed(50) where id = 'd0000000-0000-0000-0000-0000000000b4'), 0,
  'A feed: a check-in rejected by someone else never appears');
select is((select count(*)::int from public.friend_feed(50) where user_id in
  ('a0000000-0000-0000-0000-0000000000c3', 'a0000000-0000-0000-0000-0000000000d4', 'a0000000-0000-0000-0000-0000000000a1')), 0,
  'A feed: pending friend, stranger and A own rows never appear');
select is((select count(*)::int from public.friend_feed(50) where id = 'd0000000-0000-0000-0000-0000000000e1'), 1,
  'A feed: a deleted profile keeps showing its rows exactly as today');
select is(array(select id from public.friend_feed(50, null, null, null, true)),
  array(select c.id from public.checkins c
        where c.user_id <> 'a0000000-0000-0000-0000-0000000000a1' and c.photo_path is not null
          and (c.rejected_at is null or c.rejected_by = 'a0000000-0000-0000-0000-0000000000a1')
        order by c.local_date desc, c.created_at desc, c.id desc),
  'A feed, photos only = the same filter on the tables');
select is(array(select id from public.friend_feed(50, null, null, null, true)),
  array['d0000000-0000-0000-0000-0000000000b1', 'd0000000-0000-0000-0000-0000000000b7']::uuid[],
  'A photos only: the photo and the duplicate photo; never the private-habit photo or the one rejected by a stranger');
select is((select habit_name || '/' || habit_color || '/' || habit_frequency_type from public.friend_feed(50)
  where id = 'd0000000-0000-0000-0000-0000000000b6'), 'Gimnasio/rosa/weekly',
  'rows carry the habit fields the feed needs (name, color, frequency)');

-- limit: one extra row tells the caller there is a next page
select is((select count(*)::int from public.friend_feed(2)), 3, 'limit n returns n + 1 rows (the +1 marks "more")');

-- keyset pagination: walking the pages reproduces the full order with no overlap or gap
create temp table walk (n int, id uuid) on commit drop;
grant all on walk to authenticated;
do $$
declare
  r record; cur_day date; cur_at timestamptz; cur_id uuid; page int := 0; got int;
begin
  loop
    page := page + 1; got := 0;
    for r in select * from public.friend_feed(2, cur_day, cur_at, cur_id) loop
      got := got + 1;
      if got <= 2 then insert into walk values (page, r.id); cur_day := r.local_date; cur_at := r.created_at; cur_id := r.id; end if;
    end loop;
    exit when got <= 2 or page > 10;
  end loop;
end $$;
select is(array(select id from walk order by n, ctid),
  array(select id from public.friend_feed(50)),
  'keyset pages of 2 reproduce the whole feed in order');

-- ===== A: friend profile (owner) =====
select is(array(select id from public.friend_feed(50, null, null, null, false, 'a0000000-0000-0000-0000-0000000000b2')),
  array(select c.id from public.checkins c
        where c.user_id = 'a0000000-0000-0000-0000-0000000000b2'
          and (c.rejected_at is null or c.rejected_by = 'a0000000-0000-0000-0000-0000000000a1')
        order by c.local_date desc, c.created_at desc, c.id desc),
  'A viewing B: owner mode = the tables');
select is((select count(*)::int from public.friend_feed(50, null, null, null, false, 'a0000000-0000-0000-0000-0000000000b2')), 5,
  'A viewing B: public + friends rows, the duplicate photo and A rejection; no private, no foreign rejection');
select is((select count(*)::int from public.friend_feed(50, null, null, null, false, 'a0000000-0000-0000-0000-0000000000c3')), 0,
  'A viewing a pending friend: nothing');
select is((select count(*)::int from public.friend_feed(50, null, null, null, false, 'a0000000-0000-0000-0000-0000000000d4')), 0,
  'A viewing a stranger: nothing');
select is(array(select id from public.friend_feed(50, null, null, null, false, 'a0000000-0000-0000-0000-0000000000a1')),
  array['d0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000a2']::uuid[],
  'A viewing A: own rows, the rejected one included');

-- ===== A: checkin_dates =====
select is((select dates from public.checkin_dates(array['b0000000-0000-0000-0000-0000000000b1']::uuid[], current_date - 400)),
  array[current_date - 1, current_date - 2, current_date - 5],
  'A: B public habit gives its non-rejected dates (duplicate photo included, rejected ones left out), newest first');
select is((select count(*)::int from public.checkin_dates(array['b0000000-0000-0000-0000-0000000000b3']::uuid[], current_date - 400)), 0,
  'A: B private habit ids return nothing');
select is((select count(*)::int from public.checkin_dates(array['b0000000-0000-0000-0000-0000000000c1', 'b0000000-0000-0000-0000-0000000000d1']::uuid[], current_date - 400)), 0,
  'A: pending friend and stranger habit ids return nothing');
select is((select dates from public.checkin_dates(array['b0000000-0000-0000-0000-0000000000a1']::uuid[], current_date - 400)),
  array[current_date - 1],
  'A: own habit leaves out the rejected check-in');
select is((select count(*)::int from public.checkin_dates(array['b0000000-0000-0000-0000-0000000000b1']::uuid[], current_date - 1)), 1,
  'from bound is inclusive');
select is((select dates from public.checkin_dates(array['b0000000-0000-0000-0000-0000000000b1']::uuid[], current_date - 1)),
  array[current_date - 1], 'dates before from are left out');
select is(array(select habit_id from public.checkin_dates(
    array['b0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b3', 'b0000000-0000-0000-0000-0000000000a1']::uuid[], current_date - 400)
    order by habit_id),
  array['b0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000b1']::uuid[],
  'mixed ids: only the habits A may see come back, one row per habit');
select is((select count(*)::int from public.checkin_dates(array[]::uuid[], current_date - 400)), 0, 'empty id list: no rows');
select is((select dates from public.checkin_dates(array['b0000000-0000-0000-0000-0000000000e1']::uuid[], current_date - 400)),
  array[current_date - 1], 'A: a deleted friend habit behaves as today');
select is((select dates from public.checkin_dates(array['b0000000-0000-0000-0000-0000000000b2']::uuid[], current_date - 400)),
  array[current_date - 1], 'A: B friends-only habit dates are visible to an accepted friend');
select is(array(select id from public.friend_feed(50, null, null, null, false, 'a0000000-0000-0000-0000-0000000000e5')),
  array['d0000000-0000-0000-0000-0000000000e1']::uuid[], 'A viewing the deleted friend: their rows, as the tables show them');
select is(array(select id from public.friend_feed(50, null, null, null, false, 'a0000000-0000-0000-0000-0000000000b2')),
  array(select c.id from public.checkins c
        where c.user_id = 'a0000000-0000-0000-0000-0000000000b2'
          and (c.rejected_at is null or c.rejected_by = 'a0000000-0000-0000-0000-0000000000a1')
        order by c.local_date desc, c.created_at desc, c.id desc),
  'A viewing B (with the duplicate, private and foreign-rejected photos around) = the tables');
select is(array(select id from public.friend_feed(50, null, null, null, true, 'a0000000-0000-0000-0000-0000000000b2')),
  array['d0000000-0000-0000-0000-0000000000b1', 'd0000000-0000-0000-0000-0000000000b7']::uuid[],
  'A viewing B, photos only: no private or foreign-rejected photo');
-- oracle: same dates as the per-habit table query the pages ran before
select is((select dates from public.checkin_dates(array['b0000000-0000-0000-0000-0000000000b1']::uuid[], current_date - 400)),
  array(select local_date from public.checkins where habit_id = 'b0000000-0000-0000-0000-0000000000b1'
        and rejected_at is null and local_date >= current_date - 400 order by local_date desc),
  'checkin_dates = the per-habit query it replaces');

-- ===== B (accepted friend, owner of the private habit) =====
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
select is((select count(*)::int from public.friend_feed(50, null, null, null, false, 'a0000000-0000-0000-0000-0000000000b2')), 9,
  'B viewing B: every own row (private habit, private photo, both rejected ones)');
select is(array(select id from public.friend_feed(50)),
  array['d0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000a2']::uuid[],
  'B feed: A rows, including the one B rejected');
select is((select dates from public.checkin_dates(array['b0000000-0000-0000-0000-0000000000b3']::uuid[], current_date - 400)),
  array[current_date - 1, current_date - 6], 'B: own private habit dates are visible to B');

-- ===== C (pending), S (stranger): nothing =====
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
select is((select count(*)::int from public.friend_feed(50)), 0, 'C (pending, not accepted) feed is empty');
select is((select count(*)::int from public.friend_feed(50, null, null, null, false, 'a0000000-0000-0000-0000-0000000000a1')), 0,
  'C cannot read A through p_owner');
select is((select count(*)::int from public.checkin_dates(array['b0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000b1']::uuid[], current_date - 400)), 0,
  'C cannot read A or B dates through habit ids');
select is((select count(*)::int from public.checkin_dates(array['b0000000-0000-0000-0000-0000000000b2']::uuid[], current_date - 400)), 0,
  'C (pending) cannot read B friends-only habit dates');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
select is((select count(*)::int from public.checkin_dates(array['b0000000-0000-0000-0000-0000000000b2']::uuid[], current_date - 400)), 0,
  'S (stranger) cannot read B friends-only habit dates');
select is((select count(*)::int from public.friend_feed(50)), 0, 'S (stranger) feed is empty');
select is((select count(*)::int from public.friend_feed(50, null, null, null, false, 'a0000000-0000-0000-0000-0000000000b2')), 0,
  'S cannot read B through p_owner');
select is((select count(*)::int from public.checkin_dates(array['b0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b3']::uuid[], current_date - 400)), 0,
  'S cannot read B dates through habit ids, private or public');

-- ===== D (deleted profile, still accepted friend of A): as today, the tables decide =====
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000e5","role":"authenticated"}', true);
select is(array(select id from public.friend_feed(50)),
  array(select c.id from public.checkins c
        where c.user_id <> 'a0000000-0000-0000-0000-0000000000e5'
          and (c.rejected_at is null or c.rejected_by = 'a0000000-0000-0000-0000-0000000000e5')
        order by c.local_date desc, c.created_at desc, c.id desc),
  'D feed = what the tables show D (RPC adds nothing on top of RLS)');
select is((select dates from public.checkin_dates(array['b0000000-0000-0000-0000-0000000000a1']::uuid[], current_date - 400)),
  array[current_date - 1], 'D (deleted) reads the dates of the friend A habit exactly as the tables allow');
select is((select count(*)::int from public.checkin_dates(array['b0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b3']::uuid[], current_date - 400)), 0,
  'D (deleted) cannot read B dates: not a friend');

-- ===== arguments: the limit is clamped, the id list is capped =====
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select is((select count(*)::int from public.friend_feed(0)), 2, 'p_limit 0 is clamped to 1 (returns 1 + 1 rows)');
select is((select count(*)::int from public.friend_feed(-5)), 2, 'a negative p_limit is clamped to 1');
select is((select count(*)::int from public.friend_feed(null)), 6, 'a null p_limit uses the default instead of no limit');
select is((select count(*)::int from public.friend_feed(2147483647)), 6, 'a huge p_limit does not overflow');
select lives_ok($$ select * from public.checkin_dates(array(select gen_random_uuid() from generate_series(1, 500)), current_date - 400) $$,
  'checkin_dates accepts 500 habit ids');
select throws_ok($$ select * from public.checkin_dates(array(select gen_random_uuid() from generate_series(1, 501)), current_date - 400) $$,
  'P0001', 'too_many_habits', 'checkin_dates refuses more than 500 habit ids');
reset role;
-- 110 more public check-ins of B: the upper clamp is 100 (+1)
insert into public.checkins (habit_id, user_id, local_date, created_at)
  select 'b0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000b2', current_date - 20 - g, now() - (20 + g) * interval '1 day'
  from generate_series(1, 110) g;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select is((select count(*)::int from public.friend_feed(1000)), 101, 'p_limit above 100 is clamped to 100 (+1)');
reset role;
select ok((select has_function_privilege('authenticated', 'public.friend_feed(int,date,timestamptz,uuid,boolean,uuid)', 'execute')),
  'friend_feed: EXECUTE for authenticated');
select ok((select obj_description('public.friend_feed(int,date,timestamptz,uuid,boolean,uuid)'::regprocedure, 'pg_proc') is not null
  and obj_description('public.checkin_dates(uuid[],date)'::regprocedure, 'pg_proc') is not null), 'both RPCs carry a comment');

-- ===== the plan uses the new index and the lateral shape =====
reset role;
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'checkins_user_feed_idx'),
  'checkins_user_feed_idx exists');

select * from finish();
rollback;
