-- Admin-editable notification templates with a version trail. Saving and
-- deleting are single functions so the previous wording, the new wording and
-- the audit entry commit or roll back together. Called only by the backend.

alter table public.notification_templates
  add column if not exists name text not null default '';

create table if not exists public.notification_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.notification_templates(id) on delete cascade,
  subject text not null,
  body_template text not null,
  changed_by uuid references public.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists notification_template_versions_template_idx
  on public.notification_template_versions (template_id, changed_at desc);

alter table public.notification_template_versions enable row level security;

create or replace function public.admin_save_notification_template(
  p_admin_id uuid,
  p_type text,
  p_name text,
  p_subject text,
  p_body text
)
returns table (o_created boolean, o_template_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_subject text;
  v_body text;
begin
  select t.id, t.subject, t.body_template
    into v_id, v_subject, v_body
  from public.notification_templates t
  where t.type = p_type
  for update;

  if found then
    insert into public.notification_template_versions
      (template_id, subject, body_template, changed_by)
    values (v_id, v_subject, v_body, p_admin_id);

    update public.notification_templates
    set name = p_name,
        subject = p_subject,
        body_template = p_body,
        updated_at = now()
    where id = v_id;

    insert into public.admin_audit_log (admin_id, action, target_type, target_id, reason)
    values (p_admin_id, 'notification_template.update', 'notification_template', v_id, p_type);

    return query select false, v_id;
  else
    insert into public.notification_templates (type, name, subject, body_template)
    values (p_type, p_name, p_subject, p_body)
    returning id into v_id;

    insert into public.admin_audit_log (admin_id, action, target_type, target_id, reason)
    values (p_admin_id, 'notification_template.create', 'notification_template', v_id, p_type);

    return query select true, v_id;
  end if;
end;
$$;

create or replace function public.admin_delete_notification_template(
  p_admin_id uuid,
  p_type text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select t.id into v_id
  from public.notification_templates t
  where t.type = p_type
  for update;

  if not found then
    return false;
  end if;

  delete from public.notification_templates where id = v_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, reason)
  values (p_admin_id, 'notification_template.delete', 'notification_template', v_id, p_type);

  return true;
end;
$$;

revoke all on function public.admin_save_notification_template(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_delete_notification_template(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_save_notification_template(uuid, text, text, text, text)
  to service_role;
grant execute on function public.admin_delete_notification_template(uuid, text)
  to service_role;
