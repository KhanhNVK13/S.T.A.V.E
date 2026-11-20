alter table public.comments alter column author_id drop not null;
alter table public.comments drop constraint comments_author_id_fkey;
alter table public.comments add constraint comments_author_id_fkey
  foreign key (author_id) references public.users(id) on delete set null;

alter table public.pull_request_comments alter column author_id drop not null;
alter table public.pull_request_comments drop constraint pull_request_comments_author_id_fkey;
alter table public.pull_request_comments add constraint pull_request_comments_author_id_fkey
  foreign key (author_id) references public.users(id) on delete set null;
