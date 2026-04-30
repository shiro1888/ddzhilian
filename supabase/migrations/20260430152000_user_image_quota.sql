alter table public.user_profiles
  add column if not exists image_quota_period_started_at timestamptz null,
  add column if not exists image_quota_used integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_image_quota_used_nonnegative'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_image_quota_used_nonnegative
      check (image_quota_used >= 0);
  end if;
end $$;
