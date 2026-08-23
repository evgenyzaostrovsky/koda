create table if not exists public.user_app_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  goals jsonb not null default '[]'::jsonb,
  habits jsonb not null default '[]'::jsonb,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_app_state_set_updated_at on public.user_app_state;

create trigger user_app_state_set_updated_at before update on public.user_app_state
for each row execute function public.set_updated_at();

alter table public.user_app_state enable row level security;

drop policy if exists "user_app_state_all_own" on public.user_app_state;

create policy "user_app_state_all_own" on public.user_app_state
for all using (user_id = auth.uid()) with check (user_id = auth.uid());
