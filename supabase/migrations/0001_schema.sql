-- Kizuna Tracker: core schema. RLS and grants live in 0002, storage in 0003.

create extension if not exists citext with schema extensions;

-- profiles: created during onboarding (no trigger on auth.users).
create table public.profiles (
  id uuid primary key references auth.users (id),
  username extensions.citext not null unique
    constraint profiles_username_format check (username::text ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null,
  avatar_path text,
  timezone text not null,
  reminder_time time not null default '20:00',
  is_adult boolean not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id),
  addressee_id uuid not null references public.profiles (id),
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint friendships_not_self check (requester_id <> addressee_id)
);
-- one friendship per unordered pair
create unique index friendships_pair_key on public.friendships (
  least(requester_id, addressee_id), greatest(requester_id, addressee_id)
);
create index friendships_addressee_idx on public.friendships (addressee_id);
create index friendships_requester_idx on public.friendships (requester_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  inviter_id uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index invites_inviter_idx on public.invites (inviter_id);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  name text not null,
  icon text not null,
  frequency_type text not null check (frequency_type in ('daily', 'weekly')),
  target_per_week int check (target_per_week between 1 and 7),
  requires_photo boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index habits_user_idx on public.habits (user_id);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id),
  user_id uuid not null references public.profiles (id),
  local_date date not null,
  photo_path text,
  photo_sha256 text,
  is_duplicate boolean not null default false,
  rejected_at timestamptz,
  rejected_by uuid references public.profiles (id),
  reject_reason text check (reject_reason in ('not_habit', 'duplicate', 'unclear', 'other')),
  created_at timestamptz not null default now(),
  constraint checkins_habit_day_key unique (habit_id, local_date),
  -- a rejection is all-or-nothing: who, when and why
  constraint checkins_rejection_complete check (
    (rejected_at is null and rejected_by is null and reject_reason is null)
    or (rejected_at is not null and rejected_by is not null and reject_reason is not null)
  )
);
create index checkins_user_idx on public.checkins (user_id);
create index checkins_sha_idx on public.checkins (user_id, photo_sha256) where photo_sha256 is not null;

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id),
  rival_id uuid not null references public.profiles (id),
  creator_habit_id uuid not null references public.habits (id),
  rival_habit_id uuid references public.habits (id),
  frequency_type text not null check (frequency_type in ('daily', 'weekly')),
  target_per_week int check (target_per_week between 1 and 7),
  requires_photo boolean not null default false,
  weeks int not null check (weeks between 1 and 52),
  fine_amount int not null check (fine_amount > 0),
  timezone text not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'active', 'declined', 'cancelled', 'finished')),
  starts_on date,
  cancel_requested_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint challenges_not_self check (creator_id <> rival_id)
);
create index challenges_creator_idx on public.challenges (creator_id);
create index challenges_rival_idx on public.challenges (rival_id);

create table public.challenge_periods (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id),
  period_start date not null,
  period_end date not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint challenge_periods_key unique (challenge_id, period_start)
);

-- ledger only: no money moves. Net balances are computed, never stored.
create table public.debts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id),
  period_start date not null,
  debtor_id uuid not null references public.profiles (id),
  creditor_id uuid not null references public.profiles (id),
  amount int not null check (amount > 0),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint debts_period_debtor_key unique (challenge_id, period_start, debtor_id),
  constraint debts_not_self check (debtor_id <> creditor_id)
);
create index debts_debtor_idx on public.debts (debtor_id);
create index debts_creditor_idx on public.debts (creditor_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Accepted friendship in either direction.
-- SECURITY DEFINER so RLS policies on other tables can evaluate it without
-- granting read access to friendships rows; search_path pinned to ''.
-- Note: callable by any authenticated user for any pair of ids (returns only a boolean).
create function public.is_friend(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

-- Marks a photo as repeated when the same user already uploaded the same SHA-256.
-- Runs as definer because owners cannot write is_duplicate themselves (see 0002).
create function public.checkins_mark_duplicate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.photo_sha256 is null then
    new.is_duplicate := false;
  else
    new.is_duplicate := exists (
      select 1 from public.checkins c
      where c.user_id = new.user_id
        and c.photo_sha256 = new.photo_sha256
        and c.id <> new.id
    );
  end if;
  return new;
end;
$$;

create trigger checkins_mark_duplicate
before insert or update of photo_sha256 on public.checkins
for each row execute function public.checkins_mark_duplicate();
