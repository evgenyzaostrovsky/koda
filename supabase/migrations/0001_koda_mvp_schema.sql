-- KODA MVP schema
-- Auth is handled by Supabase Auth. Domain data is scoped by user_id = auth.uid().

create extension if not exists "pgcrypto";

create type public.onboarding_status as enum ('not_started', 'in_progress', 'completed', 'skipped');
create type public.goal_status as enum ('active', 'completed', 'paused', 'archived');
create type public.goal_step_status as enum ('pending', 'completed', 'skipped');
create type public.quest_status as enum ('pending', 'completed', 'skipped', 'expired');
create type public.quest_difficulty as enum ('micro', 'easy', 'medium', 'hard', 'keystone');
create type public.xp_transaction_type as enum ('quest_completed', 'bonus', 'manual_adjustment', 'level_reward');
create type public.xp_source_type as enum ('quest', 'goal', 'attribute', 'system');
create type public.journal_mood as enum ('bad', 'low', 'neutral', 'good', 'great');
create type public.ai_provider as enum ('gemini', 'openrouter', 'rules');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text not null default '',
  avatar_url text,
  timezone text not null default 'UTC',
  onboarding_status public.onboarding_status not null default 'not_started',
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_quest_completed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.onboarding_status not null default 'in_progress',
  current_step text,
  answers jsonb not null default '{}'::jsonb,
  selected_attributes text[] not null default '{}'::text[],
  generated_future_self jsonb,
  ai_provider public.ai_provider,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.future_self (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  archetype text not null default 'The Builder',
  level integer not null default 1 check (level >= 1),
  current_xp integer not null default 0 check (current_xp >= 0),
  total_xp integer not null default 0 check (total_xp >= 0),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attributes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null,
  level integer not null default 1 check (level >= 1),
  xp integer not null default 0 check (xp >= 0),
  total_xp integer not null default 0 check (total_xp >= 0),
  icon text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  attribute_id uuid references public.attributes(id) on delete set null,
  title text not null,
  description text,
  status public.goal_status not null default 'active',
  progress numeric(5,2) not null default 0 check (progress >= 0 and progress <= 100),
  target_date date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goal_steps (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  title text not null,
  status public.goal_step_status not null default 'pending',
  sort_order integer not null default 0,
  xp_reward integer not null default 50 check (xp_reward >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  goal_step_id uuid references public.goal_steps(id) on delete set null,
  attribute_id uuid references public.attributes(id) on delete set null,
  title text not null,
  description text,
  xp_reward integer not null default 50 check (xp_reward >= 0),
  difficulty public.quest_difficulty not null default 'easy',
  status public.quest_status not null default 'pending',
  due_date date not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  type public.xp_transaction_type not null,
  source_type public.xp_source_type not null,
  source_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  mood public.journal_mood,
  ai_insight text,
  created_at timestamptz not null default now()
);

create index profiles_onboarding_status_idx on public.profiles(onboarding_status);
create index onboarding_sessions_user_id_idx on public.onboarding_sessions(user_id);
create index attributes_user_id_idx on public.attributes(user_id);
create index goals_user_status_idx on public.goals(user_id, status);
create index goal_steps_goal_id_idx on public.goal_steps(goal_id);
create index quests_user_due_status_idx on public.quests(user_id, due_date, status);
create index xp_transactions_user_created_idx on public.xp_transactions(user_id, created_at desc);
create index journal_entries_user_created_idx on public.journal_entries(user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create trigger onboarding_sessions_set_updated_at before update on public.onboarding_sessions
for each row execute function public.set_updated_at();

create trigger future_self_set_updated_at before update on public.future_self
for each row execute function public.set_updated_at();

create trigger attributes_set_updated_at before update on public.attributes
for each row execute function public.set_updated_at();

create trigger goals_set_updated_at before update on public.goals
for each row execute function public.set_updated_at();

create trigger quests_set_updated_at before update on public.quests
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.onboarding_sessions enable row level security;
alter table public.future_self enable row level security;
alter table public.attributes enable row level security;
alter table public.goals enable row level security;
alter table public.goal_steps enable row level security;
alter table public.quests enable row level security;
alter table public.xp_transactions enable row level security;
alter table public.journal_entries enable row level security;

create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid());

create policy "onboarding_all_own" on public.onboarding_sessions
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "future_self_all_own" on public.future_self
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "attributes_all_own" on public.attributes
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "goals_all_own" on public.goals
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "goal_steps_select_own" on public.goal_steps
for select using (
  exists (
    select 1 from public.goals
    where goals.id = goal_steps.goal_id
    and goals.user_id = auth.uid()
  )
);

create policy "goal_steps_insert_own" on public.goal_steps
for insert with check (
  exists (
    select 1 from public.goals
    where goals.id = goal_steps.goal_id
    and goals.user_id = auth.uid()
  )
);

create policy "goal_steps_update_own" on public.goal_steps
for update using (
  exists (
    select 1 from public.goals
    where goals.id = goal_steps.goal_id
    and goals.user_id = auth.uid()
  )
);

create policy "goal_steps_delete_own" on public.goal_steps
for delete using (
  exists (
    select 1 from public.goals
    where goals.id = goal_steps.goal_id
    and goals.user_id = auth.uid()
  )
);

create policy "quests_all_own" on public.quests
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "xp_transactions_select_own" on public.xp_transactions
for select using (user_id = auth.uid());

create policy "xp_transactions_insert_own" on public.xp_transactions
for insert with check (user_id = auth.uid());

create policy "journal_entries_all_own" on public.journal_entries
for all using (user_id = auth.uid()) with check (user_id = auth.uid());
