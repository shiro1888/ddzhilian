create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'admin' constraint admin_roles_role_admin_only check (role = 'admin'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admin_roles_email_lower_idx
  on public.admin_roles (lower(email));

alter table public.admin_roles enable row level security;
