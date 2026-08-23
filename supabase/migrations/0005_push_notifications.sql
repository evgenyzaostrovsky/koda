create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null default 'default',
  endpoint text not null unique,
  subscription jsonb not null,
  timezone text not null default 'UTC',
  reminder_time text not null default '14:00',
  enabled boolean not null default true,
  last_sent_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_insert" on public.push_subscriptions;
create policy "push_subscriptions_insert"
  on public.push_subscriptions
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "push_subscriptions_update" on public.push_subscriptions;
create policy "push_subscriptions_update"
  on public.push_subscriptions
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "push_subscriptions_select" on public.push_subscriptions;
create policy "push_subscriptions_select"
  on public.push_subscriptions
  for select
  to anon, authenticated
  using (true);

create or replace function public.set_push_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists push_subscriptions_updated_at on public.push_subscriptions;
create trigger push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row
  execute function public.set_push_subscriptions_updated_at();
