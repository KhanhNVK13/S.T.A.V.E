alter table public.commits alter column author_id drop not null;
alter table public.commits drop constraint commits_author_id_fkey,
  add constraint commits_author_id_fkey foreign key (author_id) references public.users(id) on delete set null;

alter table public.branches alter column created_by drop not null;
alter table public.branches drop constraint branches_created_by_fkey,
  add constraint branches_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;

alter table public.commit_tags alter column created_by drop not null;
alter table public.commit_tags drop constraint commit_tags_created_by_fkey,
  add constraint commit_tags_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;

alter table public.audio_sketches alter column created_by drop not null;
alter table public.audio_sketches drop constraint audio_sketches_created_by_fkey,
  add constraint audio_sketches_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;

alter table public.project_collaborators alter column invited_by drop not null;
alter table public.project_collaborators drop constraint project_collaborators_invited_by_fkey,
  add constraint project_collaborators_invited_by_fkey foreign key (invited_by) references public.users(id) on delete set null;

alter table public.jam_events alter column created_by drop not null;
alter table public.jam_events drop constraint jam_events_created_by_fkey,
  add constraint jam_events_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;

alter table public.admin_audit_log alter column admin_id drop not null;
alter table public.admin_audit_log drop constraint admin_audit_log_admin_id_fkey,
  add constraint admin_audit_log_admin_id_fkey foreign key (admin_id) references public.users(id) on delete set null;

alter table public.reports alter column reporter_id drop not null;
alter table public.reports drop constraint reports_reporter_id_fkey,
  add constraint reports_reporter_id_fkey foreign key (reporter_id) references public.users(id) on delete set null;
alter table public.reports drop constraint reports_resolved_by_fkey,
  add constraint reports_resolved_by_fkey foreign key (resolved_by) references public.users(id) on delete set null;

alter table public.payment_issues drop constraint payment_issues_resolved_by_fkey,
  add constraint payment_issues_resolved_by_fkey foreign key (resolved_by) references public.users(id) on delete set null;

alter table public.comments drop constraint comments_author_id_fkey,
  add constraint comments_author_id_fkey foreign key (author_id) references public.users(id) on delete cascade;
alter table public.pull_request_comments drop constraint pull_request_comments_author_id_fkey,
  add constraint pull_request_comments_author_id_fkey foreign key (author_id) references public.users(id) on delete cascade;
alter table public.pull_requests drop constraint pull_requests_author_id_fkey,
  add constraint pull_requests_author_id_fkey foreign key (author_id) references public.users(id) on delete cascade;
