-- UC-110 / UC-111: admin-editable notification templates.
--
-- `notification_templates` was created outside this migration folder (the
-- notification module reads it through `NotificationsService.loadTemplate`),
-- so this migration is written to work both ways:
--   - on an existing database: `create table if not exists` is a no-op and only
--     the missing `name` column is added;
--   - on a fresh database: the table is created with the columns the code
--     already reads (`type`, `subject`, `body_template`).
--
-- `name` is the human-readable label an admin picks for a template; it was not
-- needed until templates became admin-editable, so older rows get '' and are
-- displayed under their notification type instead.

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  name text not null default '',
  subject text not null default '',
  body_template text not null default '',
  updated_at timestamptz not null default now()
);

-- Older databases may already have the table without `name`.
alter table public.notification_templates
  add column if not exists name text not null default '';

alter table public.notification_templates
  add column if not exists updated_at timestamptz not null default now();

-- One template per notification type. `NotificationsService.loadTemplate` uses
-- `maybeSingle`, and the admin API rejects a second template for a type with
-- 409, so the database must enforce it too.
create unique index if not exists notification_templates_type_key
  on public.notification_templates (type);

-- Audit history of a template, written when a template is edited (UC-111).
create table if not exists public.notification_template_versions (
  id uuid primary key default gen_random_uuid(),
  -- Null once the template is deleted (Q2: keep the history), so `type` is
  -- stored on the version row itself and stays readable either way.
  template_id uuid references public.notification_templates (id) on delete set null,
  type text not null default '',
  subject text not null,
  body_template text not null,
  changed_by uuid references public.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

-- `type` was added after the table may already exist.
alter table public.notification_template_versions
  add column if not exists type text not null default '';

alter table public.notification_template_versions
  add column if not exists changed_by uuid references public.users (id) on delete set null;

create index if not exists notification_template_versions_template_idx
  on public.notification_template_versions (template_id, changed_at desc);

alter table public.notification_template_versions enable row level security;

-- The versions table is new, so it needs its own grant for the backend.
-- `notification_templates` already has the grants it needs (the notification
-- module reads it with the same service_role client); UC-111 additionally
-- updates and deletes templates, so those privileges are granted here too.
grant select, insert on public.notification_template_versions to service_role;
grant select, insert, update, delete on public.notification_templates to service_role;
