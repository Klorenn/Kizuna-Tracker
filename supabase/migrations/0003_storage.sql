-- Private proofs bucket. Path convention: {user_id}/{checkin_id}.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Read: own folder, or folder of an accepted friend. The uuid cast is guarded so a
-- malformed folder name cannot raise inside the policy.
create policy proofs_select_owner_or_friend on storage.objects
  for select to authenticated
  using (
    bucket_id = 'proofs'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_friend(
        (select auth.uid()),
        case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then ((storage.foldername(name))[1])::uuid end
      )
    )
  );

-- No client INSERT/UPDATE/DELETE policies: uploads are done by the server with the
-- service role (it hashes and names the file), so clients can neither write nor rename
-- objects. Without a policy, RLS denies those operations.
