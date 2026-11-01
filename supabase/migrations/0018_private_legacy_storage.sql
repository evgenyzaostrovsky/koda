-- PROPOSED: apply only after explicit authorization and coordinated client/API rollout.
-- No rows are deleted, claimed, renamed, or reassigned. Legacy rows remain stored.
-- Clients must stop writing guest mirrors before this policy change.
-- This does NOT secure service-role HTTP endpoints (calendar and push registration).
begin;

-- Unexpected permissive policies could reopen access. Require an explicit review
-- instead of silently deleting custom policies or leaving a bypass in place.
do $$
begin
  if exists (
    select 1 from pg_policies where schemaname = 'public' and (
      (tablename = 'journal_entries' and policyname <> 'journal_entries_all_own') or
      (tablename = 'planner_events' and policyname not in (
        'planner_events_public_select', 'planner_events_public_insert',
        'planner_events_public_update', 'planner_events_public_delete', 'planner_events_all_own'
      )) or
      (tablename = 'push_subscriptions' and policyname not in (
        'push_subscriptions_insert', 'push_subscriptions_update', 'push_subscriptions_select'
      ))
    )
  ) then
    raise exception 'Unexpected legacy storage policy; review policies before applying 0018';
  end if;
end;
$$;

alter table public.journal_entries enable row level security;
alter table public.planner_events enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on table public.journal_entries, public.planner_events, public.push_subscriptions
  from public, anon, authenticated;
grant select, insert, update, delete on table public.journal_entries, public.planner_events
  to authenticated;
grant select, insert, update, delete on table public.journal_entries, public.planner_events, public.push_subscriptions
  to service_role;

drop policy if exists journal_entries_all_own on public.journal_entries;
create policy journal_entries_all_own on public.journal_entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists planner_events_public_select on public.planner_events;
drop policy if exists planner_events_public_insert on public.planner_events;
drop policy if exists planner_events_public_update on public.planner_events;
drop policy if exists planner_events_public_delete on public.planner_events;
drop policy if exists planner_events_all_own on public.planner_events;
create policy planner_events_all_own on public.planner_events
  for all to authenticated
  using (owner_key = 'user:' || (select auth.uid())::text)
  with check (owner_key = 'user:' || (select auth.uid())::text);

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
drop policy if exists push_subscriptions_update on public.push_subscriptions;
drop policy if exists push_subscriptions_select on public.push_subscriptions;
-- No client policy: only the separately authenticated server may use service_role.

notify pgrst, 'reload schema';
commit;
