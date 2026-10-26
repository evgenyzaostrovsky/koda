-- Append-only chat messages. Apply separately after review; no automatic application.
create table public.chat_messages (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id text not null check (char_length(message_id) between 1 and 128),
  role text not null check (role in ('user', 'koda')),
  text text not null check (
    char_length(btrim(text)) > 0 and
    char_length(text) <= case when role = 'user' then 2000 else 4000 end
  ),
  created_at timestamptz not null default now(),
  provider text check (provider in ('gemini', 'openrouter', 'yandex')),
  primary key (user_id, message_id)
);

create index chat_messages_owner_created_idx
  on public.chat_messages (user_id, created_at desc, message_id desc);

alter table public.chat_messages enable row level security;

revoke all on table public.chat_messages from public, anon, authenticated;
grant select, insert on table public.chat_messages to authenticated;

create policy chat_messages_select_own on public.chat_messages
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy chat_messages_insert_own on public.chat_messages
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
