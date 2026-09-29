-- Harden the private schema.
--
-- 20260928000100 tried to make private functions non-executable with
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE EXECUTE ... FROM PUBLIC`,
-- but schema-scoped default privileges cannot remove the built-in global
-- EXECUTE-to-PUBLIC grant, so every private.* function stayed executable by
-- anon/authenticated. They were not reachable through the API (the private
-- schema is not exposed), but nothing should rely on that.
--
-- Only the two helpers used inside RLS policies (evaluated as the calling
-- role) keep EXECUTE. SECURITY DEFINER RPCs run as their owner and triggers
-- do not check EXECUTE at fire time, so nothing else needs it.

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_role(text), private.is_staff() to anon, authenticated;
