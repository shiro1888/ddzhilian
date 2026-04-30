alter table public.user_profiles
  add column if not exists image_paid_quota_remaining integer not null default 0,
  add column if not exists image_paid_quota_used integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_image_paid_quota_remaining_nonnegative'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_image_paid_quota_remaining_nonnegative
      check (image_paid_quota_remaining >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_image_paid_quota_used_nonnegative'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_image_paid_quota_used_nonnegative
      check (image_paid_quota_used >= 0);
  end if;
end $$;
