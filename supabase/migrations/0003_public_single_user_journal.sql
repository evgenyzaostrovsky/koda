alter table public.journal_entries
  alter column user_id drop not null,
  add column if not exists owner_key text not null default 'default';

create index if not exists journal_entries_owner_entry_date_idx
  on public.journal_entries(owner_key, entry_date desc);

drop policy if exists "journal_entries_all_own" on public.journal_entries;

create policy "journal_entries_all_own" on public.journal_entries
for all
using (
  user_id = auth.uid()
  or owner_key = 'default'
)
with check (
  user_id = auth.uid()
  or owner_key = 'default'
);
