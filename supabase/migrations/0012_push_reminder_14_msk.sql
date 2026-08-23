alter table public.push_subscriptions
  alter column reminder_time set default '14:00';

update public.push_subscriptions
set reminder_time = '14:00'
where enabled = true
  and reminder_time = '21:00';

notify pgrst, 'reload schema';
