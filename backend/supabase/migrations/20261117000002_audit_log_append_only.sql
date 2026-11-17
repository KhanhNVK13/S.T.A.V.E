-- BR-107: administrative log entries cannot be edited or deleted. RLS already has no
-- UPDATE/DELETE policy, but service_role bypasses RLS and kept table grants, so the rule
-- was not enforced for the backend. Remove the privileges (foreign-key actions such as
-- ON DELETE SET NULL on admin_id run as the table owner and are unaffected).
revoke update, delete, truncate on table public.admin_audit_log from service_role, authenticated, anon;
