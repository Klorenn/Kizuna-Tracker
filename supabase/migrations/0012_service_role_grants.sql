-- 0001 revoked default privileges on new public objects; on a fresh database that also left
-- service_role without table access (it only got TRUNCATE/REFERENCES/TRIGGER). Server code
-- that uses the service role (cron, photo check-ins, account deletion) needs the usual
-- table privileges. service_role bypasses RLS; API roles (anon, authenticated) are untouched.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
