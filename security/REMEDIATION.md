# Security Remediation Tasks

Generated: 2026-07-24T05:51:42.027Z

| Status | Scanner | Severity | ID | Affected | File | Recommended fix |
| --- | --- | --- | --- | --- | --- | --- |
| accepted-risk | supabase | warn | SUPA_authenticated_security_definer_function_executable | public.has_role, public.is_admin, public.is_chw, public.log_admin_action, public.admin_run_security_events_purge, public.security_events_summary, public.security_events_retention_status, public.security_top_ips, public.verify_audit_chain, public.admin_verify_audit_chain | supabase/migrations/20260510103858_bbd68668-925c-4856-a196-32e3556550c7.sql | Accepted: RLS helpers need authenticated EXECUTE; admin RPCs (including audit-chain verifier) gate via is_admin(auth.uid()). |
| accepted-risk | supabase | warn | SUPA_extension_in_public | extension public.pg_net | pseudo:supabase-extension | Accepted: required in public for managed pg_cron jobs. |
