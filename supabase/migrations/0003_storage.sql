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

-- Write: only into the caller's own folder, with the exact {user_id}/{uuid}.jpg shape.
create policy proofs_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'proofs'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy proofs_update_own_folder on storage.objects
  for update to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy proofs_delete_own_folder on storage.objects
  for delete to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);
