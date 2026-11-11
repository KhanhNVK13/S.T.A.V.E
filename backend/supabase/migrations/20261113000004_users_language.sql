alter table public.users
  add column if not exists language text not null default 'vi'
  check (language in ('en', 'vi'));
