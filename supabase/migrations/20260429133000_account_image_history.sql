create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  image_quota_period_started_at timestamptz null,
  image_quota_used integer not null default 0 constraint user_profiles_image_quota_used_nonnegative check (image_quota_used >= 0),
  image_paid_quota_remaining integer not null default 0 constraint user_profiles_image_paid_quota_remaining_nonnegative check (image_paid_quota_remaining >= 0),
  image_paid_quota_used integer not null default 0 constraint user_profiles_image_paid_quota_used_nonnegative check (image_paid_quota_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_select_own'
  ) then
    create policy user_profiles_select_own on public.user_profiles
      for select to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_insert_own'
  ) then
    create policy user_profiles_insert_own on public.user_profiles
      for insert to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_update_own'
  ) then
    create policy user_profiles_update_own on public.user_profiles
      for update to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.image_generations (
  generation_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  provider text not null,
  model text not null,
  size text not null,
  quality text not null,
  images jsonb not null,
  created_at timestamptz not null
);

create index if not exists image_generations_user_created_idx
  on public.image_generations (user_id, created_at desc, generation_id desc);

alter table public.image_generations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'image_generations'
      and policyname = 'image_generations_select_own'
  ) then
    create policy image_generations_select_own on public.image_generations
      for select to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'image_generations'
      and policyname = 'image_generations_insert_own'
  ) then
    create policy image_generations_insert_own on public.image_generations
      for insert to authenticated
      with check (auth.uid() = user_id);
  end if;
end $$;
