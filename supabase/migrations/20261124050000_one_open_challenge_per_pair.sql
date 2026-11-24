-- At most one open (proposed or active) challenge per pair of people, whichever side created it.
-- proposeChallenge already checks first and maps 23505 to its typed "exists" result; this index
-- closes the race where two submits pass the check at the same time.
create unique index if not exists challenges_one_open_per_pair
  on public.challenges (least(creator_id, rival_id), greatest(creator_id, rival_id))
  where status in ('proposed', 'active');
