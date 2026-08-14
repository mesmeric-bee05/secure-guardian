# Security Analytics + M-PESA Callback Hardening

## Goal
Prove (with tests) that exports reject bad input and non-admins, that audit trails record denials, and make the M-PESA callback secret rotatable with zero downtime. Add a CI secret-scan gate over the repo and build artifacts.

## 1. Security Analytics export — input rejection
- `supabase/functions/security-events-export/index.ts` already validates its body with a strict Zod schema; add explicit denial logging so rejected payloads are recorded as `validation_failed` security events with the offending field names (no values).
- New Playwright spec `tests/e2e/security-analytics-invalid-filters.spec.ts`:
  - Unknown field (`{ bogus: 1 }`), wrong type (`eventType: 123`), out-of-enum value, oversized `scopeContains`, malformed `since` → each must return 4xx JSON with an `error` payload.
  - Assert no `Content-Disposition` header and no download event fires (no partial CSV stream).

## 2. Non-admin export denial + audit record
- Add an audit write in the export function when a caller passes JWT validation but fails `is_admin()`: insert an `audit_logs` row (service-role) with action `security_events_export_denied`, the user id, IP and reason, then return 403.
- `tests/e2e/security-analytics-authz.spec.ts`: extend with a non-admin export attempt asserting 403 and, via an admin session, that exactly one matching `audit_logs` row appeared for that attempt.

## 3. PostgREST delete-denial proof
- Extend the authz spec with a direct `DELETE /rest/v1/audit_logs` as a non-admin: expect 403/empty-affected, then re-read the row count as admin and assert it is unchanged.

## 4. UTC bucket timestamp assertions
- In `tests/e2e/security-analytics-filters.spec.ts`, add assertions that every exported bucket timestamp matches a strict UTC pattern (`YYYY-MM-DDTHH:MM:SSZ` / ISO with `Z`), that hour buckets align to `:00:00`, day buckets to `T00:00:00Z`, and every value falls inside the selected `since`→now window in ascending order.

## 5. M-PESA callback: rejection regression tests + audit logging
- `supabase/functions/mpesa-callback/index.ts`: on every rejection (missing token, invalid token, unconfigured secret, unknown/non-pending donation, amount mismatch) write an `audit_logs` entry with action `mpesa_callback_rejected`, the reason code, and the affected donation id / checkout request id when resolvable, plus a `security_events` row for unauthorized attempts.
- `supabase/functions/mpesa-callback/callback.e2e.test.ts`: regression cases for no token, wrong token, token in each supported position (query/header/path), and an assertion that each rejection produced exactly one audit row with the expected reason and no donation status change.

## 6. Zero-downtime callback secret rotation
- Accept two secrets: `MPESA_CALLBACK_TOKEN` (current, used when building the STK-push callback URL) and `MPESA_CALLBACK_TOKEN_PREVIOUS` (accepted for verification only, during the overlap window).
- `mpesa-callback` verifies against both with constant-time compare and tags accepted-with-previous requests in logs so the overlap can be observed and closed.
- `mpesa-config-check` reports which token(s) are active and whether a rotation overlap is currently open.
- Add `docs/mpesa-token-rotation.md` with the operational runbook (set previous → set new → wait for in-flight callbacks → clear previous).

## 7. CI secret scan gate
- `scripts/scan-secrets.mjs` currently covers `src/`, `public/`, `index.html` and `dist/`. Extend it with a `--all` mode that walks the whole repository (excluding `node_modules`, `.git`, and test fixtures that intentionally contain fake keys) plus build artifacts, and keep the existing shapes list, adding `sb_publishable_`-vs-`sb_secret_` disambiguation and a service-role JWT claim check.
- New workflow `.github/workflows/secret-scan.yml`: runs on PR and push, builds the app, runs `node scripts/scan-secrets.mjs --all --bundle`, fails the job on any hit, and uploads the findings file as an artifact.

## Technical notes
- All new audit/security writes happen server-side with the service-role client, so RLS-denied clients cannot forge or suppress them.
- Tests use the existing Playwright/Deno harnesses and the current e2e credential env vars; no new secrets are needed except `MPESA_CALLBACK_TOKEN_PREVIOUS`, which stays unset outside rotation windows.
