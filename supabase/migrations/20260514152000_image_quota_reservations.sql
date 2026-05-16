create table if not exists public.image_quota_reservations (
  reservation_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  period_started_at timestamptz not null,
  free_count integer not null default 0 constraint image_quota_reservations_free_count_nonnegative check (free_count >= 0),
  paid_count integer not null default 0 constraint image_quota_reservations_paid_count_nonnegative check (paid_count >= 0),
  confirmed_image_count integer null constraint image_quota_reservations_confirmed_count_nonnegative check (confirmed_image_count is null or confirmed_image_count >= 0),
  status text not null default 'active' constraint image_quota_reservations_status_valid check (status in ('active', 'confirmed', 'released', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists image_quota_reservations_user_status_idx
  on public.image_quota_reservations (user_id, status, expires_at);

alter table public.image_quota_reservations enable row level security;

create or replace function public.reserve_image_quota(
  p_user_id uuid,
  p_email text,
  p_period_started_at timestamptz,
  p_free_limit integer,
  p_image_count integer,
  p_reservation_id text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.user_profiles%rowtype;
  v_requested integer := greatest(0, p_image_count);
  v_free_limit integer := greatest(0, p_free_limit);
  v_active_free integer := 0;
  v_active_paid integer := 0;
  v_available_free integer := 0;
  v_available_paid integer := 0;
  v_reserve_free integer := 0;
  v_reserve_paid integer := 0;
begin
  if p_user_id is null then
    raise exception 'IMAGE_QUOTA_INVALID_USER';
  end if;

  if p_period_started_at is null then
    raise exception 'IMAGE_QUOTA_INVALID_PERIOD';
  end if;

  if v_requested <= 0 then
    raise exception 'IMAGE_QUOTA_INVALID_COUNT';
  end if;

  if p_reservation_id is null or btrim(p_reservation_id) = '' then
    raise exception 'IMAGE_QUOTA_INVALID_RESERVATION';
  end if;

  insert into public.user_profiles (
    user_id,
    email,
    image_quota_period_started_at,
    image_quota_used,
    image_paid_quota_remaining,
    image_paid_quota_used,
    updated_at
  )
  values (
    p_user_id,
    coalesce(nullif(btrim(p_email), ''), 'unknown'),
    p_period_started_at,
    0,
    0,
    0,
    now()
  )
  on conflict (user_id) do update
    set email = excluded.email,
        updated_at = now();

  select *
    into v_profile
    from public.user_profiles
    where user_id = p_user_id
    for update;

  update public.image_quota_reservations
    set status = 'expired',
        updated_at = now()
    where user_id = p_user_id
      and status = 'active'
      and expires_at <= now();

  if v_profile.image_quota_period_started_at is null
     or v_profile.image_quota_period_started_at <> p_period_started_at then
    update public.image_quota_reservations
      set status = 'expired',
          updated_at = now()
      where user_id = p_user_id
        and status = 'active'
        and period_started_at <> p_period_started_at;

    update public.user_profiles
      set image_quota_period_started_at = p_period_started_at,
          image_quota_used = 0,
          updated_at = now()
      where user_id = p_user_id
      returning * into v_profile;
  end if;

  select
    coalesce(sum(free_count), 0)::integer,
    coalesce(sum(paid_count), 0)::integer
    into v_active_free, v_active_paid
    from public.image_quota_reservations
    where user_id = p_user_id
      and status = 'active'
      and period_started_at = p_period_started_at
      and expires_at > now();

  v_available_free := greatest(0, v_free_limit - coalesce(v_profile.image_quota_used, 0) - v_active_free);
  v_available_paid := greatest(0, coalesce(v_profile.image_paid_quota_remaining, 0) - v_active_paid);

  if v_requested > v_available_free + v_available_paid then
    raise exception 'IMAGE_QUOTA_EXHAUSTED';
  end if;

  v_reserve_free := least(v_requested, v_available_free);
  v_reserve_paid := v_requested - v_reserve_free;

  insert into public.image_quota_reservations (
    reservation_id,
    user_id,
    period_started_at,
    free_count,
    paid_count,
    status,
    expires_at,
    updated_at
  )
  values (
    p_reservation_id,
    p_user_id,
    p_period_started_at,
    v_reserve_free,
    v_reserve_paid,
    'active',
    p_expires_at,
    now()
  );

  v_active_free := v_active_free + v_reserve_free;
  v_active_paid := v_active_paid + v_reserve_paid;

  return jsonb_build_object(
    'freeUsed', coalesce(v_profile.image_quota_used, 0),
    'paidRemaining', coalesce(v_profile.image_paid_quota_remaining, 0),
    'paidUsed', coalesce(v_profile.image_paid_quota_used, 0),
    'freeReserved', v_active_free,
    'paidReserved', v_active_paid,
    'reservation', jsonb_build_object(
      'reservationId', p_reservation_id,
      'periodStartedAt', p_period_started_at,
      'freeCount', v_reserve_free,
      'paidCount', v_reserve_paid,
      'expiresAt', p_expires_at
    )
  );
end;
$$;

create or replace function public.image_quota_status_for_user(
  p_user_id uuid,
  p_period_started_at timestamptz,
  p_free_limit integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.user_profiles%rowtype;
  v_active_free integer := 0;
  v_active_paid integer := 0;
begin
  update public.image_quota_reservations
    set status = 'expired',
        updated_at = now()
    where user_id = p_user_id
      and status = 'active'
      and expires_at <= now();

  select *
    into v_profile
    from public.user_profiles
    where user_id = p_user_id;

  if not found then
    raise exception 'IMAGE_QUOTA_PROFILE_NOT_FOUND';
  end if;

  select
    coalesce(sum(free_count), 0)::integer,
    coalesce(sum(paid_count), 0)::integer
    into v_active_free, v_active_paid
    from public.image_quota_reservations
    where user_id = p_user_id
      and status = 'active'
      and period_started_at = p_period_started_at
      and expires_at > now();

  return jsonb_build_object(
    'freeUsed', case
      when v_profile.image_quota_period_started_at = p_period_started_at
      then coalesce(v_profile.image_quota_used, 0)
      else 0
    end,
    'paidRemaining', coalesce(v_profile.image_paid_quota_remaining, 0),
    'paidUsed', coalesce(v_profile.image_paid_quota_used, 0),
    'freeReserved', v_active_free,
    'paidReserved', v_active_paid
  );
end;
$$;

create or replace function public.confirm_image_quota_reservation(
  p_user_id uuid,
  p_reservation_id text,
  p_free_limit integer,
  p_image_count integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.user_profiles%rowtype;
  v_reservation public.image_quota_reservations%rowtype;
  v_free_limit integer := greatest(0, p_free_limit);
  v_actual_count integer := greatest(0, p_image_count);
  v_reserved_free_use integer := 0;
  v_reserved_paid_use integer := 0;
  v_extra_count integer := 0;
  v_other_active_free integer := 0;
  v_other_active_paid integer := 0;
  v_available_free integer := 0;
  v_available_paid integer := 0;
  v_extra_free_use integer := 0;
  v_extra_paid_use integer := 0;
  v_total_free_use integer := 0;
  v_total_paid_use integer := 0;
begin
  select *
    into v_reservation
    from public.image_quota_reservations
    where reservation_id = p_reservation_id
      and user_id = p_user_id
    for update;

  if not found then
    raise exception 'IMAGE_QUOTA_RESERVATION_NOT_FOUND';
  end if;

  if v_reservation.status = 'confirmed' then
    return public.image_quota_status_for_user(p_user_id, v_reservation.period_started_at, v_free_limit);
  end if;

  if v_reservation.status <> 'active' then
    raise exception 'IMAGE_QUOTA_RESERVATION_NOT_ACTIVE';
  end if;

  select *
    into v_profile
    from public.user_profiles
    where user_id = p_user_id
    for update;

  if not found then
    raise exception 'IMAGE_QUOTA_PROFILE_NOT_FOUND';
  end if;

  if v_actual_count <= 0 then
    update public.image_quota_reservations
      set status = 'released',
          confirmed_image_count = 0,
          updated_at = now()
      where reservation_id = p_reservation_id;

    return public.image_quota_status_for_user(p_user_id, v_reservation.period_started_at, v_free_limit);
  end if;

  if v_profile.image_quota_period_started_at is null
     or v_profile.image_quota_period_started_at <> v_reservation.period_started_at then
    update public.user_profiles
      set image_quota_period_started_at = v_reservation.period_started_at,
          image_quota_used = 0,
          updated_at = now()
      where user_id = p_user_id
      returning * into v_profile;
  end if;

  v_reserved_free_use := least(v_reservation.free_count, v_actual_count);
  v_reserved_paid_use := least(v_reservation.paid_count, v_actual_count - v_reserved_free_use);
  v_extra_count := v_actual_count - v_reserved_free_use - v_reserved_paid_use;

  select
    coalesce(sum(free_count), 0)::integer,
    coalesce(sum(paid_count), 0)::integer
    into v_other_active_free, v_other_active_paid
    from public.image_quota_reservations
    where user_id = p_user_id
      and reservation_id <> p_reservation_id
      and status = 'active'
      and period_started_at = v_reservation.period_started_at
      and expires_at > now();

  v_available_free := greatest(0, v_free_limit - coalesce(v_profile.image_quota_used, 0) - v_other_active_free);
  v_available_paid := greatest(0, coalesce(v_profile.image_paid_quota_remaining, 0) - v_other_active_paid);

  if v_extra_count > 0 then
    v_extra_free_use := least(v_extra_count, v_available_free);
    v_extra_paid_use := v_extra_count - v_extra_free_use;

    if v_extra_paid_use > v_available_paid then
      raise exception 'IMAGE_QUOTA_EXHAUSTED';
    end if;
  end if;

  v_total_free_use := v_reserved_free_use + v_extra_free_use;
  v_total_paid_use := v_reserved_paid_use + v_extra_paid_use;

  update public.user_profiles
    set image_quota_period_started_at = v_reservation.period_started_at,
        image_quota_used = coalesce(image_quota_used, 0) + v_total_free_use,
        image_paid_quota_remaining = greatest(0, coalesce(image_paid_quota_remaining, 0) - v_total_paid_use),
        image_paid_quota_used = coalesce(image_paid_quota_used, 0) + v_total_paid_use,
        updated_at = now()
    where user_id = p_user_id
    returning * into v_profile;

  update public.image_quota_reservations
    set status = 'confirmed',
        confirmed_image_count = v_actual_count,
        updated_at = now()
    where reservation_id = p_reservation_id;

  return public.image_quota_status_for_user(p_user_id, v_reservation.period_started_at, v_free_limit);
end;
$$;

create or replace function public.release_image_quota_reservation(
  p_user_id uuid,
  p_reservation_id text,
  p_free_limit integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.image_quota_reservations%rowtype;
begin
  select *
    into v_reservation
    from public.image_quota_reservations
    where reservation_id = p_reservation_id
      and user_id = p_user_id
    for update;

  if not found then
    raise exception 'IMAGE_QUOTA_RESERVATION_NOT_FOUND';
  end if;

  if v_reservation.status = 'active' then
    update public.image_quota_reservations
      set status = 'released',
          updated_at = now()
      where reservation_id = p_reservation_id;
  end if;

  return public.image_quota_status_for_user(p_user_id, v_reservation.period_started_at, p_free_limit);
end;
$$;

revoke all on function public.reserve_image_quota(uuid, text, timestamptz, integer, integer, text, timestamptz) from public;
revoke all on function public.confirm_image_quota_reservation(uuid, text, integer, integer) from public;
revoke all on function public.release_image_quota_reservation(uuid, text, integer) from public;
revoke all on function public.image_quota_status_for_user(uuid, timestamptz, integer) from public;
grant execute on function public.reserve_image_quota(uuid, text, timestamptz, integer, integer, text, timestamptz) to service_role;
grant execute on function public.confirm_image_quota_reservation(uuid, text, integer, integer) to service_role;
grant execute on function public.release_image_quota_reservation(uuid, text, integer) to service_role;
grant execute on function public.image_quota_status_for_user(uuid, timestamptz, integer) to service_role;
