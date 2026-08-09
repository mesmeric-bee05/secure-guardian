# Security e2e: debug artifacts, CSV format proofs, audit_logs RLS test, USSD 429 headers

## Verified current state

- `playwright.e2e.config.ts` sets `trace: "retain-on-failure"` only — no screenshots, no video, no download persistence. The `security-e2e` workflow uploads `playwright-report/` (wrong folder: the config writes to `playwright-report-e2e/`) and does not upload Deno/USSD logs.
- `tests/e2e/security-analytics-filters.spec.ts` checks the CSV header once (`bucket,event_type,count`) and sums counts; it never validates bucket-timestamp formats, and does no CSV format assertions in the day/hour bucket tests.
- `tests/e2e/security-analytics-authz.spec.ts` proves RLS on `security_events` for a non-admin, but has no `audit_logs` test.
- `supabase/functions/ussd-handler/index.ts` (lines 224, 229, 303, 375) returns **HTTP 200** with plain `END Too many requests.` text on throttle — the USSD gateway requires 200/plain text. The shared `enforceLimits` helper (which does emit `Retry-After`, `X-RateLimit-Remaining`, `X-RateLimit-Limit` on a 429) is not used for those USSD denials, so no rate-limit headers are currently sent on USSD throttles.

## What will be built

### 1. CI artifacts on failure or skip
- `playwright.e2e.config.ts`: add `screenshot: "only-on-failure"`, `video: "retain-on-failure"`, keep `trace: "retain-on-failure"`, and set `outputDir: "test-results-e2e"`.
- Analytics specs save each downloaded CSV to `test-results-e2e/downloads/<test-name>.csv` via `download.saveAs(...)` so the exact exported bytes are inspectable in CI.
- `.github/workflows/security-e2e.yml`:
  - Fix the report path to `playwright-report-e2e/` and also upload `test-results-e2e/` (traces, screenshots, videos, saved CSVs) and `playwright-results.json`.
  - Tee the Deno USSD run to `/tmp/deno-ussd.log` (already partly done) and upload it plus `/tmp/vite.log`.
  - Run the upload steps with `if: always()` so artifacts appear on failure **and** on the skip-gate failure from `scripts/assert-no-skips.mjs`.

### 2. CSV shape assertions for day and hour buckets
In `tests/e2e/security-analytics-filters.spec.ts`, add a shared `assertCsvShape(csv, bucket)` helper used by the day/hour export tests:
- Header is exactly `bucket,event_type,count` (no BOM, no trailing separator).
- Every data row has exactly 3 comma-separated fields.
- `bucket` field matches `^\d{4}-\d{2}-\d{2}$` for the day bucket and `^\d{4}-\d{2}-\d{2}[ T]\d{2}:00(:00)?` for the hour bucket, and parses to a real date inside the selected from/to range.
- `event_type` matches `^[a-z0-9_]+$`; `count` matches `^\d+$` and is `>= 1`.
- Row count in the CSV equals the number shown in `sec-row-count`, and the file ends without a trailing blank line.

### 3. Non-admin cannot read `audit_logs`
New test in `tests/e2e/security-analytics-authz.spec.ts`:
- Service role inserts a tagged admin action into `audit_logs` and captures its `id`.
- A signed-in non-admin then attempts, via PostgREST with their own token: unfiltered `select`, `select ... eq('id', knownId)`, and a filter on the tag. Each must return a permission error or zero rows — knowing the identifier must not help.
- A direct REST `GET /rest/v1/audit_logs?id=eq.<id>` with the non-admin bearer token must return 401/403 or an empty array, and the body must not contain the tag.
- Service role sees the same row (proves the table is not simply empty). Row is cleaned up in `afterAll`.

### 4. USSD 429 rate-limit headers + correlation
- `supabase/functions/ussd-handler/index.ts`: keep the USSD-required 200 + `END ...` body, but attach `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Scope` headers to all four throttle responses (main IP, per-phone, clinic, donate), sourced from the bucket result that denied.
- `supabase/functions/_shared/rateLimit.ts`: expose the denial result (scope, retry seconds, remaining) so the USSD handler can build those headers without duplicating the token-bucket logic.
- `ussd.burst429.e2e.test.ts` and `ussd.concurrentburst.e2e.test.ts`: for every throttled response assert `Retry-After` is a positive integer, `X-RateLimit-Limit` equals the documented budget for the scope, `X-RateLimit-Remaining` is `0`, and `X-RateLimit-Scope` is one of `ussd-ip`/`ussd-phone`/`ussd-clinic`/`ussd-donate`; then assert the persisted `security_events` rows for that phone hash carry `event_type = rate_limit_429` and the matching `menu_path` (`""` main menu, `"5"` donate, clinic path for the clinic burst).

## Technical notes
- No database or RLS changes: `audit_logs` already has admin-only SELECT and no INSERT/UPDATE/DELETE policies; the new test is a proof, not a fix.
- The only production-code change is the USSD response headers; response status and body text stay exactly as the Africa's Talking gateway expects.

## Verification
Typecheck, `deno check` the touched functions/tests, list the Playwright specs, and validate the workflow YAML here. The e2e suites themselves still need `TEST_USER_*`, `TEST_ADMIN_*` and the service-role key against a live backend — if those are unavailable in this sandbox that will be reported as unverified, not claimed as passing.
