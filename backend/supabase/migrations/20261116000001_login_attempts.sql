-- Login lockout (BR-07): 5 consecutive failed password logins lock the email
-- for 15 minutes. Backend only (service_role); the counter is updated by one
-- atomic function so concurrent attempts cannot undercount.

create table if not exists public.login_attempts (
  email text primary key,
  failed_count integer not null default 0,
  locked_until timestamptz,
  last_failed_at timestamptz not null default now()
);

alter table public.login_attempts enable row level security;

revoke all on table public.login_attempts from public, anon, authenticated;
grant select, insert, update, delete on table public.login_attempts to service_role;

create or replace function public.record_failed_login(
  p_email text,
  p_max_attempts integer,
  p_lock_minutes integer
)
returns table (o_failed_count integer, o_locked_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(p_email);
  v_row public.login_attempts%rowtype;
  v_count integer;
  v_locked timestamptz;
begin
  insert into public.login_attempts (email)
  values (v_email)
  on conflict (email) do nothing;

  select * into v_row from public.login_attempts where email = v_email for update;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return query select v_row.failed_count, v_row.locked_until;
    return;
  end if;

  v_count := case
    when v_row.locked_until is not null then 1
    else v_row.failed_count + 1
  end;

  if v_count >= p_max_attempts then
    v_locked := now() + make_interval(mins => p_lock_minutes);
  else
    v_locked := null;
  end if;

  update public.login_attempts
  set failed_count = v_count,
      locked_until = v_locked,
      last_failed_at = now()
  where email = v_email;

  return query select v_count, v_locked;
end;
$$;

revoke all on function public.record_failed_login(text, integer, integer) from public, anon, authenticated;
grant execute on function public.record_failed_login(text, integer, integer) to service_role;
