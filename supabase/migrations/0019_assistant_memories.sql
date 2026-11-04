-- Explicitly approved assistant memory storage. Apply separately from application deployment.
begin;

create table public.assistant_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (
    char_length(btrim(content)) > 0 and char_length(content) <= 1000
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assistant_memories_owner_updated_idx
  on public.assistant_memories(user_id, updated_at desc, id desc);

create function public.touch_assistant_memory()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;

create trigger assistant_memory_updated
before update on public.assistant_memories
for each row execute function public.touch_assistant_memory();

alter table public.assistant_memories enable row level security;

revoke all on public.assistant_memories from public, anon, authenticated;
grant select, delete on public.assistant_memories to authenticated;
grant insert (user_id, content) on public.assistant_memories to authenticated;
grant update (content) on public.assistant_memories to authenticated;

create policy assistant_memories_own
on public.assistant_memories for all to authenticated
using (
  user_id = (select auth.uid())
  and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false'
)
with check (
  user_id = (select auth.uid())
  and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false'
);

commit;
