alter table public.planner_events
  add column if not exists failed boolean not null default false;

alter table public.planner_events
  add constraint planner_events_done_failed_exclusive check (not (done and failed));
