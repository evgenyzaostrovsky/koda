create table if not exists public.notes (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Без названия',
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  pinned boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_updated_idx
  on public.notes (user_id, updated_at desc);

create index if not exists notes_user_pinned_updated_idx
  on public.notes (user_id, pinned desc, updated_at desc)
  where deleted_at is null;

create index if not exists notes_user_deleted_idx
  on public.notes (user_id, deleted_at);

drop trigger if exists notes_set_updated_at on public.notes;

create trigger notes_set_updated_at before update on public.notes
for each row execute function public.set_updated_at();

alter table public.notes enable row level security;

drop policy if exists "notes_all_own" on public.notes;

create policy "notes_all_own" on public.notes
for all using (user_id = auth.uid()) with check (user_id = auth.uid());
