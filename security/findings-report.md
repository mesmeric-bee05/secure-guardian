# Security Findings Report

Generated: 2026-06-14T07:24:49.372Z

## Summary

| Scanner | Last run | Total | Critical | High | Warn | Info |
| --- | --- | --- | --- | --- | --- | --- |
| agent_security | 2026-04-08T13:31:12.735192Z | 0 | 0 | 0 | 0 | 0 |
| connector_security_scan | 2026-04-03T02:40:15.465686Z | 0 | 0 | 0 | 0 | 0 |
| supabase | 2026-06-01T11:49:23.205984488Z | 2 | 0 | 0 | 2 | 0 |
| supabase_lov | 2026-04-08T13:31:12.735191Z | 0 | 0 | 0 | 0 | 0 |

## Findings

| Scanner | Severity | ID | Name | Status |
| --- | --- | --- | --- | --- |
| supabase | warn | SUPA_authenticated_security_definer_function_executable | Signed-In Users Can Execute SECURITY DEFINER Function | accepted-risk |
| supabase | warn | SUPA_extension_in_public | Extension in Public | accepted-risk |

## Accepted risks (allowlist)

- **supabase:SUPA_authenticated_security_definer_function_executable** — RLS helpers (has_role/is_admin/is_chw) must be callable by authenticated; admin RPCs gate internally with is_admin(auth.uid()) and raise 'forbidden'. All other SD functions have EXECUTE revoked.
- **supabase:SUPA_extension_in_public** — pg_net must live in public schema for managed pg_cron jobs (security_events purge, push dispatch). Moving it breaks cron.
