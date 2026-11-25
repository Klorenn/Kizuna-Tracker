begin;
-- client_errors: shape, RLS with no client access, explicit service_role grants (the roles the API and the cron use),
-- the hourly upsert that increments count, the caps, user deletion and the 30-day purge.
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id) values ('ce000000-0000-0000-0000-000000000001'), ('ce000000-0000-0000-0000-000000000002');

-- ============================================================ shape and access
select has_table('public', 'client_errors', 'client_errors exists');
select ok((select relrowsecurity from pg_class where oid = 'public.client_errors'::regclass), 'RLS is on');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'client_errors'), 0, 'no client policies');
select ok(not has_table_privilege('anon', 'public.client_errors', 'SELECT'), 'anon cannot read');
select ok(not has_table_privilege('anon', 'public.client_errors', 'INSERT'), 'anon cannot insert');
select ok(not has_table_privilege('authenticated', 'public.client_errors', 'SELECT'), 'authenticated cannot read');
select ok(not has_table_privilege('authenticated', 'public.client_errors', 'INSERT'), 'authenticated cannot insert');
select ok(has_table_privilege('service_role', 'public.client_errors', 'SELECT')
  and has_table_privilege('service_role', 'public.client_errors', 'INSERT')
  and has_table_privilege('service_role', 'public.client_errors', 'UPDATE')
  and has_table_privilege('service_role', 'public.client_errors', 'DELETE'), 'service_role has full access');
select ok(has_function_privilege('service_role', 'public.record_client_error(uuid,text,text,text,text,text,text,text,text)', 'EXECUTE'), 'service_role runs record_client_error');
select ok(not has_function_privilege('authenticated', 'public.record_client_error(uuid,text,text,text,text,text,text,text,text)', 'EXECUTE'), 'authenticated cannot run record_client_error');
select ok(not has_function_privilege('anon', 'public.record_client_error(uuid,text,text,text,text,text,text,text,text)', 'EXECUTE'), 'anon cannot run record_client_error');
select ok(has_function_privilege('service_role', 'public.purge_client_errors()', 'EXECUTE'), 'service_role runs purge_client_errors');
select ok(not has_function_privilege('authenticated', 'public.purge_client_errors()', 'EXECUTE'), 'authenticated cannot run purge_client_errors');

-- ============================================================ upsert and dedup (as service_role, like the API)
set local role service_role;
select lives_ok($$select public.record_client_error(null, 'error', 'boom', 'at f (https://a.com/c.js)', '/perfil', 'browser', null, 'abc1234', 'fp-aaaaaaaa')$$, 'first sighting is recorded');
select lives_ok($$select public.record_client_error('ce000000-0000-0000-0000-000000000001', 'error', 'boom', 'at f (https://a.com/c.js)', '/perfil', 'browser', null, 'abc1234', 'fp-aaaaaaaa')$$, 'second sighting in the same hour');
select is((select count(*)::int from public.client_errors where fingerprint = 'fp-aaaaaaaa'), 1, 'same fingerprint and hour is one row');
select is((select count from public.client_errors where fingerprint = 'fp-aaaaaaaa'), 2, 'count was incremented');
select is((select user_id from public.client_errors where fingerprint = 'fp-aaaaaaaa'), 'ce000000-0000-0000-0000-000000000001'::uuid, 'a later known user fills a missing user_id');
select public.record_client_error('ce000000-0000-0000-0000-000000000002', 'error', 'boom', null, '/perfil', 'browser', null, 'abc1234', 'fp-aaaaaaaa');
select is((select user_id from public.client_errors where fingerprint = 'fp-aaaaaaaa'), 'ce000000-0000-0000-0000-000000000001'::uuid, 'the first user is kept');
select public.record_client_error(null, 'react', 'boom', null, '/perfil', 'native', '12', 'abc1234', 'fp-bbbbbbbb');
select is((select count(*)::int from public.client_errors), 2, 'another fingerprint is another row');
select is((select app_version from public.client_errors where fingerprint = 'fp-bbbbbbbb'), '12', 'native app version stored');

-- ============================================================ caps and path
select public.record_client_error(null, 'error', repeat('m', 5000), repeat('s', 9000), '/x?token=secret#h', 'browser', null, null, 'fp-cccccccc');
select is((select char_length(message) from public.client_errors where fingerprint = 'fp-cccccccc'), 1000, 'message capped at 1000');
select is((select char_length(stack) from public.client_errors where fingerprint = 'fp-cccccccc'), 2000, 'stack capped at 2000 (20261129120000)');
select is((select url_path from public.client_errors where fingerprint = 'fp-cccccccc'), '/x', 'query string never stored');
select throws_ok($$select public.record_client_error(null, 'bogus', 'm', null, '/', 'browser', null, null, 'fp-dddddddd')$$, '23514', null, 'kind is checked');

-- ============================================================ user deletion keeps the row
reset role;
delete from auth.users where id = 'ce000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.client_errors where fingerprint = 'fp-aaaaaaaa' and user_id is null), 1, 'deleting the user nulls user_id and keeps the row');

-- ============================================================ retention
update public.client_errors set created_at = now() - interval '31 days' where fingerprint = 'fp-bbbbbbbb';
set local role service_role;
select is(public.purge_client_errors(), 1, 'purge removes only the row older than 30 days');
select is((select count(*)::int from public.client_errors), 2, 'recent rows stay');

select * from finish();
rollback;
