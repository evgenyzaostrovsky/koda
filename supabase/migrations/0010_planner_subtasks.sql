create table if not exists public.planner_events (
  id text primary key,
  owner_key text not null,
  event_date date not null,
  event_time time,
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.planner_events
  add column if not exists subtasks jsonb not null default '[]'::jsonb;
