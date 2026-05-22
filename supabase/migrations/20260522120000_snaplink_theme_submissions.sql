create table if not exists public.snaplink_theme_submissions (
  submission_id text primary key,
  source text not null default 'snaplink-beta' constraint snaplink_theme_submissions_source_not_blank check (btrim(source) <> ''),
  self_color text not null constraint snaplink_theme_submissions_self_color_hex check (self_color ~ '^#[0-9A-Fa-f]{6}$'),
  peer_color text not null constraint snaplink_theme_submissions_peer_color_hex check (peer_color ~ '^#[0-9A-Fa-f]{6}$'),
  ai_color text not null constraint snaplink_theme_submissions_ai_color_hex check (ai_color ~ '^#[0-9A-Fa-f]{6}$'),
  device_id text null,
  device_name text null,
  account_id text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create index if not exists snaplink_theme_submissions_created_idx
  on public.snaplink_theme_submissions (created_at desc, submission_id desc);

create index if not exists snaplink_theme_submissions_device_created_idx
  on public.snaplink_theme_submissions (device_id, created_at desc)
  where device_id is not null;

alter table public.snaplink_theme_submissions enable row level security;
