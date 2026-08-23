alter table public.journal_entries
  add column if not exists entry_date date not null default current_date,
  add column if not exists sleep_start_time time,
  add column if not exists wake_time time,
  add column if not exists sleep_duration_minutes integer check (
    sleep_duration_minutes is null
    or (sleep_duration_minutes >= 0 and sleep_duration_minutes <= 1440)
  ),
  add column if not exists day_tags text[] not null default '{}'::text[],
  add column if not exists updated_at timestamptz not null default now();

create index if not exists journal_entries_user_entry_date_idx
  on public.journal_entries(user_id, entry_date desc);

drop trigger if exists journal_entries_set_updated_at on public.journal_entries;

create trigger journal_entries_set_updated_at before update on public.journal_entries
for each row execute function public.set_updated_at();
