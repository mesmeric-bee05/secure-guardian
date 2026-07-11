REVOKE EXECUTE ON FUNCTION public.admin_verify_audit_chain(bigint, bigint) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_audit_chain(bigint, bigint) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_logs_chain_bi() FROM anon, PUBLIC;