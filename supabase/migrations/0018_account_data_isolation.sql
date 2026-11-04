-- Requires explicit approval before applying to the connected project.
-- No records are updated/deleted. Legacy guest rows remain stored but private.
-- Public unauthenticated calendar subscriptions require a separate signed-feed design.
begin;

alter table public.journal_entries enable row level security;
alter table public.planner_events enable row level security;

-- Restrictive guards also constrain any older permissive policies still installed.
drop policy if exists journal_owner_guard on public.journal_entries;
create policy journal_owner_guard on public.journal_entries as restrictive
  for all to public
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists journal_entries_all_own on public.journal_entries;
create policy journal_entries_all_own on public.journal_entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists planner_owner_guard on public.planner_events;
create policy planner_owner_guard on public.planner_events as restrictive
  for all to public
  using (owner_key = 'user:' || (select auth.uid())::text)
  with check (owner_key = 'user:' || (select auth.uid())::text);

drop policy if exists planner_events_public_select on public.planner_events;
drop policy if exists planner_events_public_insert on public.planner_events;
drop policy if exists planner_events_public_update on public.planner_events;
drop policy if exists planner_events_public_delete on public.planner_events;
drop policy if exists planner_events_all_own on public.planner_events;
create policy planner_events_all_own on public.planner_events
  for all to authenticated
  using (owner_key = 'user:' || (select auth.uid())::text)
  with check (owner_key = 'user:' || (select auth.uid())::text);

commit;
