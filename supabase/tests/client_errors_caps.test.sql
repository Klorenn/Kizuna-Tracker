begin;
-- record_client_error after 20261129120000: stack capped at 2000, at most 200 distinct fingerprints per hour,
-- an existing fingerprint keeps counting when the hour is full, grants unchanged.
create extension if not exists pgtap with schema extensions;
select plan(9);

select has_index('public', 'client_errors', 'client_errors_bucket_idx', 'bucket index exists');
select ok(has_function_privilege('service_role', 'public.record_client_error(uuid,text,text,text,text,text,text,text,text)', 'EXECUTE'), 'service_role still runs record_client_error');
select ok(not has_function_privilege('authenticated', 'public.record_client_error(uuid,text,text,text,text,text,text,text,text)', 'EXECUTE'), 'authenticated still cannot');

set local role service_role;
select public.record_client_error(null, 'error', 'm', repeat('s', 9000), '/x', 'browser', null, null, 'cap-stack-0001');
select is((select char_length(stack) from public.client_errors where fingerprint = 'cap-stack-0001'), 2000, 'stack capped at 2000');

-- fill the hour: 199 more distinct fingerprints make 200 rows
select public.record_client_error(null, 'error', 'm', null, '/x', 'browser', null, null, 'cap-fill-' || lpad(g::text, 4, '0')) from generate_series(1, 199) g;
select is((select count(*)::int from public.client_errors where bucket = date_trunc('hour', now())), 200, 'the hour holds 200 rows');

select public.record_client_error(null, 'error', 'm', null, '/x', 'browser', null, null, 'cap-over-0001');
select is((select count(*)::int from public.client_errors where fingerprint = 'cap-over-0001'), 0, 'the 201st fingerprint is not inserted');
select is((select count(*)::int from public.client_errors where bucket = date_trunc('hour', now())), 200, 'still 200 rows');

select public.record_client_error(null, 'error', 'm', null, '/x', 'browser', null, null, 'cap-fill-0001');
select is((select count from public.client_errors where fingerprint = 'cap-fill-0001'), 2, 'an existing fingerprint still increments at the cap');
select is((select count(*)::int from public.client_errors where bucket = date_trunc('hour', now())), 200, 'and the row count did not grow');

select * from finish();
rollback;
