-- Immutable whole-draft revisions. Apply only after separate approval.
create table public.goal_wizard_drafts (
  user_id uuid not null references auth.users(id) on delete cascade,
  revision_id text not null check (char_length(revision_id) between 1 and 128),
  parent_ids text[] not null default '{}' check (
    cardinality(parent_ids) <= 256 and array_position(parent_ids, null) is null
  ),
  draft jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, revision_id),
  check (not (revision_id = any(parent_ids))),
  check (draft is null or (
    jsonb_typeof(draft) = 'object' and coalesce(draft->>'version', '') = '1'
    and octet_length(draft::text) <= 65536
  ))
);

create index goal_wizard_drafts_owner_created_idx
  on public.goal_wizard_drafts (user_id, created_at, revision_id);

alter table public.goal_wizard_drafts enable row level security;
revoke all on public.goal_wizard_drafts from public, anon, authenticated;
grant select, insert on public.goal_wizard_drafts to authenticated;

create policy goal_wizard_drafts_select_own on public.goal_wizard_drafts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy goal_wizard_drafts_insert_own on public.goal_wizard_drafts
  for insert to authenticated with check ((select auth.uid()) = user_id);
