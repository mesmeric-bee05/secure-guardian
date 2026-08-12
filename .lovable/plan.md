# Security e2e: always-on artifacts, CSV contract proofs, audit_logs write-deny, USSD burst side-effect limits

## Verified current state

- `playwright.e2e.config.ts` already sets `outputDir: test-results-e2e`, `screenshot: only-on-failure`, `video`/`trace: retain-on-failure`, `acceptDownloads: true`. Artifacts therefore do NOT exist for passing or skipped tests.
- `.github/workflows/security-e2e.yml` uploads `playwright-report-e2e/`, `test-results-e2e/`, `playwright-results.json`, `/tmp/vite.log` with `if: always()`, but the skip gate (`scripts/assert-no-skips.mjs`) runs before the upload step, and skipped tests produce no screenshots/CSVs at all.
- `tests/e2e/security-analytics-filters.spec.ts` saves each download via `readDownload()` and validates header + per-field formats (`assertCsvShape`), but never asserts the download filename, MIME type, or row ordering.
- The in-app export in `SecurityAnalyticsTab.tsx` is a client-side `Blob` (`text/csv;charset=utf-8`) with `a.download = security-analytics-<from>_<to>-<granularity>-<eventType><menuPath>.csv`. There is no HTTP response for it, so Content-Type/Content-Disposition can only be asserted on the server endpoint `security-events-export`, which sets `text/csv; charset=utf-8` and `attachment; filename="security-events-<stamp>.csv"`.
- `tests/e2e/security-analytics-authz.spec.ts` proves non-admin SELECT on `audit_logs` is blocked; there is no INSERT/UPDATE proof. Schema shows `audit_logs` has only an admin SELECT policy (writes denied).
- USSD burst tests assert 429 counts, headers, and that expected `security_events` rows exist; they do not assert an upper bound on rows created.

## What will be built

### 1. CI artifacts on every run, including skips
- `playwright.e2e.config.ts`: switch to `screenshot: "on"`, `video: "on"`, `trace: "on"` so passing and partially-run tests also leave evidence.
- Analytics specs: keep saving every download under `test-results-e2e/downloads/`; additionally emit a short JSON sidecar per export (filters used, row count, filename) for fast triage.
- `.github/workflows/security-e2e.yml`: move the artifact upload step BEFORE the skip gate (or make the gate a separate final job) so artifacts are always uploaded even when the build fails on skips; keep `if: always()` on all upload steps and add the Deno log.

### 2. CSV content-type / filename assertions (day + hour buckets)
- Browser export: assert `download.suggestedFilename()` matches `^security-analytics-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}-(day|hour)-[a-z0-9_\-]*\.csv$` and encodes the active granularity and filters, for both buckets.
- Server export (`security-events-export`) with an admin token: assert `content-type` is `text/csv; charset=utf-8` and `content-disposition` is `attachment; filename="security-events-....csv"`, for both `day` and `hour` requests.

### 3. Deterministic ordering + typed field assertions
Extend `assertCsvShape` in `tests/e2e/security-analytics-filters.spec.ts`:
- Rows are sorted ascending by bucket, then by `event_type` alphabetically; re-exporting the same filters twice yields byte-identical CSV.
- No duplicate `(bucket, event_type)` pairs.
- Every bucket value falls inside the selected from/to range and is aligned to the granularity (midnight for day, `:00` minutes for hour).
- Sum of `count` for the seeded tag/event equals the seeded row count and equals the UI `sec-row-count` badge.

### 4. Non-admin cannot write `audit_logs`
New test in `tests/e2e/security-analytics-authz.spec.ts`, using a signed-in non-admin token via raw PostgREST:
- `POST /rest/v1/audit_logs` → expect 401/403 (or a permission error body); no row appears when re-checked with service_role.
- `PATCH /rest/v1/audit_logs?id=eq.<seeded id>` → expect 401/403 or zero rows affected; service_role re-read shows the row's `action`/`details` unchanged.
- Also attempt via the supabase-js client for symmetry. Seeded row cleaned up in `finally`.

### 5. USSD 429 burst side-effect bounds
In `ussd.burst429.e2e.test.ts` and `ussd.concurrentburst.e2e.test.ts`:
- After each burst, count `security_events` rows for that phone hash and assert the count equals the observed number of 429 responses (no duplicate logging, no logging on successful requests).
- Assert every logged row's `event_type` is `rate_limit_429` and `menu_path` matches the branch under test; no rows with other `event_type`/`menu_path` values are created by the burst.
- Assert the burst creates zero `audit_logs` rows in the test window (throttling is not an admin action).

## Not fixed here: M-PESA banner in the screenshot
"M-PESA is not configured on this environment yet" is not a code bug — `mpesa-config-check` correctly reports missing Daraja credentials, and `Support.tsx` disables the donate button as designed. Making live donations work requires the Daraja consumer key/secret, shortcode, and passkey to be added as backend secrets. Say the word and I'll request them and wire the environment.

## Verification
Typecheck, `deno check` on touched functions/tests, Playwright spec listing, and workflow YAML validation. The suites still need `TEST_USER_*`, `TEST_ADMIN_*` and the service-role key against a live backend; if unavailable here that will be reported as unverified, not claimed as passing.
