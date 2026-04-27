create table if not exists public.history_texts (
  history_id text primary key,
  room_id text not null,
  session_id text null,
  is_public boolean not null default false,
  source_device_id text not null,
  source_device_name text not null,
  text text not null,
  created_at timestamptz not null
);

create index if not exists history_texts_room_created_idx
  on public.history_texts (room_id, created_at desc, history_id desc);

create index if not exists history_texts_created_idx
  on public.history_texts (created_at desc, history_id desc);

create table if not exists public.history_files (
  history_id text primary key,
  room_id text not null,
  session_id text null,
  is_public boolean not null default false,
  source_device_id text not null,
  source_device_name text not null,
  file_name text not null,
  size bigint not null check (size >= 0),
  mime_type text null,
  created_at timestamptz not null,
  storage_path text not null
);

create index if not exists history_files_room_created_idx
  on public.history_files (room_id, created_at desc, history_id desc);

create index if not exists history_files_created_idx
  on public.history_files (created_at desc, history_id desc);
