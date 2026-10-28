create or replace function public.enforce_registration_enabled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.platform_settings
    where key = 'registration_enabled'
      and value in ('false'::jsonb, '"false"'::jsonb)
  ) then
    raise exception 'registration_disabled' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_registration_enabled() from public, anon, authenticated;

drop trigger if exists enforce_registration_enabled on auth.users;
create trigger enforce_registration_enabled
before insert on auth.users
for each row execute function public.enforce_registration_enabled();
