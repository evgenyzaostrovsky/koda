alter table public.user_app_state
  add column if not exists koda_days jsonb not null default '[]'::jsonb;

create table if not exists public.koda_days (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  timezone text not null default 'local',
  status text not null default 'not_started' check (status in ('not_started', 'active', 'completed')),
  started_at timestamptz,
  finished_at timestamptz,
  goal_score numeric,
  planner_score numeric,
  total_score numeric,
  classification text check (classification in ('strike', 'pace', 'minimum', 'sabotage', 'unclassified')),
  score_version integer not null default 1,
  summary text,
  focus_loss text,
  next_recommendation text,
  goals_snapshot jsonb,
  planner_snapshot jsonb,
  calculation_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create index if not exists koda_days_user_date_idx on public.koda_days (user_id, local_date desc);
create index if not exists koda_days_user_status_idx on public.koda_days (user_id, status);

alter table public.koda_days enable row level security;

drop policy if exists "koda_days_all_own" on public.koda_days;
create policy "koda_days_all_own"
  on public.koda_days for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
