-- Reports must outlive a deleted project so the admin can still close them
-- (UC-101 5.E1). The project link becomes NULL instead of cascading.
alter table public.reports alter column project_id drop not null;

alter table public.reports drop constraint if exists reports_project_id_fkey;
alter table public.reports
  add constraint reports_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete set null;
