alter table public.user_app_state
  add column if not exists projects jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
