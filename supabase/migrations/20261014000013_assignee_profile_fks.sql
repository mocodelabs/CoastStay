-- Assignee columns reference organization_members (same-org guarantee). These additional simple
-- foreign keys to profiles let PostgREST embed the assignee's name.
alter table public.housekeeping_tasks
  add constraint housekeeping_tasks_assignee_profile_fk foreign key (assigned_to) references public.profiles (id) on delete set null;
alter table public.maintenance_requests
  add constraint maintenance_requests_assignee_profile_fk foreign key (assigned_to) references public.profiles (id) on delete set null;
alter table public.recurring_task_templates
  add constraint recurring_task_templates_assignee_profile_fk foreign key (assigned_to) references public.profiles (id) on delete set null;
