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

create index if not exists planner_events_owner_date_idx
  on public.planner_events (owner_key, event_date, event_time);

alter table public.planner_events
  alter column event_time drop not null;

alter table public.planner_events enable row level security;

drop policy if exists "planner_events_public_select" on public.planner_events;
create policy "planner_events_public_select"
  on public.planner_events for select
  using (true);

drop policy if exists "planner_events_public_insert" on public.planner_events;
create policy "planner_events_public_insert"
  on public.planner_events for insert
  with check (true);

drop policy if exists "planner_events_public_update" on public.planner_events;
create policy "planner_events_public_update"
  on public.planner_events for update
  using (true)
  with check (true);

drop policy if exists "planner_events_public_delete" on public.planner_events;
create policy "planner_events_public_delete"
  on public.planner_events for delete
  using (true);
