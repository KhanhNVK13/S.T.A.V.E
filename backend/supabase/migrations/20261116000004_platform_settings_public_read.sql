-- platform_settings already has a public SELECT policy (CLAUDE.md 4.5) but the
-- anon and authenticated roles were never granted SELECT, so the register page
-- could not learn that sign-ups are switched off (UC-109 2.1). Reads only:
-- the table holds no secrets and writes stay admin-only through RLS.
grant select on table public.platform_settings to anon, authenticated;
