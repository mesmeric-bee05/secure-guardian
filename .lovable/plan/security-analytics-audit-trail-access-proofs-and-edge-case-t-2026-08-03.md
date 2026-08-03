# Security Analytics: audit trail, access proofs, and edge-case tests

## Goal
Close the remaining gaps around the Security Analytics admin panel: prove non-admins cannot reach the data (UI, endpoint, or direct query), cover empty-result and concurrent-burst behaviour with automated tests, and record an audit entry every time an admin exports analytics CSV.

## Current state (verified)
- `SecurityAnalyticsTab` queries `security_events` directly from the browser and builds the CSV client-side. It has an admin UI guard but writes no audit record.
- `SecurityEventsTab` already calls the `log_admin_action` RPC for export start/cancel — that pattern is the one to reuse.
- The `security-events-export` edge function already enforces bearer auth, `is_admin`, rate limits, and returns 403 for non-admins; it has no test asserting the non-admin 403 from a real signed-in non-admin session.
- Playwright e2e lives in `tests/e2e` with one spec covering analytics filters + CSV.

## What will be built

### 1. Audit trail for analytics CSV export
- Add an `auditLog` helper in `SecurityAnalyticsTab` calling `log_admin_action` with actions `security_analytics_export` (and `security_analytics_export_failed`), details carrying the active filters, date range, bucket, and row count.
- Surface the last export audit entry in the tab (small "Last export: <action> · <time> · <rows> rows" line) read back from `audit_logs`, so admins see the trail without leaving the page.

### 2. Non-admin access proofs
- New spec `tests/e2e/security-analytics-authz.spec.ts`:
  - Signed-in non-admin hitting the `security-events-export` function receives 403 with a JSON error body and no CSV payload.
  - Unauthenticated request receives 401.
  - Direct PostgREST `select` on `security_events` as a non-admin returns zero rows (RLS block), while the seeded rows are visible to the service role — proving the filter is RLS, not an empty table.
  - Non-admin loading `/admin` Security Analytics sees the "Admin access required" card and no chart.

### 3. Empty-result filtering + empty CSV
- Extend the analytics e2e spec: apply a filter combination that matches nothing (nonexistent menu path, or a past date window), assert the row count reads `0 rows`, the chart renders its empty state, and the CSV export produces a header-only file (no data lines).
- Keep the export button enabled semantics consistent with whatever the empty state does today; if it is disabled at zero rows, the test asserts the disabled state instead of a download.

### 4. Concurrent multi-phone USSD burst
- New Deno test `supabase/functions/ussd-handler/ussd.concurrentburst.e2e.test.ts`: fire bursts from several distinct phone numbers in parallel, assert each phone independently receives throttled bilingual responses, and verify `security_events` holds `rate_limit_429` rows per phone hash with the correct scope and `menu_path` — and that one phone's burst does not consume another's per-phone budget.

## Technical notes
- Audit writes go through the existing `log_admin_action` SECURITY DEFINER RPC (self-gated by `is_admin`), so no migration or new grant is needed.
- Non-admin e2e needs a second test identity: `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` (already used by the Deno suite). Specs skip gracefully when those or `SUPABASE_SERVICE_ROLE_KEY` are absent, matching the existing spec's convention.
- Seeding/cleanup for all new specs uses the service-role client with a unique tag in `details`, as the current filters spec does.
- No schema or RLS changes are planned: the existing `security_events` policies are admin-only for select and deny client writes; the new tests assert that behaviour rather than modify it.

## Verification
- Run the new and existing Playwright e2e specs and the USSD Deno tests, and report actual pass/fail output. Anything that cannot run for lack of credentials will be reported as unverified rather than claimed as passing.
