# Security e2e: stronger assertions and a CI gate that fails on skips

## Current state (verified by reading the files)

- `tests/e2e/security-analytics-filters.spec.ts` — the "CSV export contents reflect active filters" test is **missing its closing `});`**, so the "no-match filter" test is declared *inside* another test body. Playwright rejects nested `test()` calls at runtime, so that spec cannot currently pass. Its audit assertion only checks `granularity: "day"` and that `rows` is a number.
- `tests/e2e/security-analytics-authz.spec.ts` — has a signed-in non-admin export test asserting 403 + JSON `{error: "Forbidden"}`; there is no assertion for an empty body, and no direct browser-context hit of the export URL.
- `supabase/functions/ussd-handler/ussd.concurrentburst.e2e.test.ts` — asserts only "some responses were throttled" and ">0 events per hash"; no success-vs-429 counts, no per-429 `menu_path` correlation.
- CI: `.github/workflows/smoke-tests.yml` runs only `playwright.smoke.config.ts`. **No workflow runs `playwright.e2e.config.ts` or the Deno edge-function tests at all**, so skipped-on-missing-secrets is currently invisible.

## What will be built

### 1. Fix the broken filters spec, then strengthen the audit assertions
- Close the CSV-export test so the three following tests are siblings again.
- In "admin CSV export writes an audit_logs entry": capture the admin's user id at login (via the seeded/signed-in session) and assert the polled `audit_logs` row matches exactly:
  - `user_id` === admin user id
  - `details.from` / `details.to` === the date strings typed into the filters
  - `details.granularity` === the selected bucket (test both `day` and `hour`)
  - `details.rows` === the numeric row count shown in `sec-row-count`
  - `resource_type` === `security_events`, `action` === `security_analytics_export`
- Read the count from the UI badge and compare, so the audit number is proven to match what was exported rather than merely being a number.

### 2. Non-admin direct hit on the export endpoint
Add to `security-analytics-authz.spec.ts`:
- A test where the non-admin session is restored in the browser and the page navigates/fetches the export function URL directly (`page.request` carrying the non-admin bearer token, plus a raw `request.post` with the same token): assert **403**, empty or `{"error":"Forbidden"}` body containing zero CSV rows, no `text/csv` content type, and `content-length` consistent with an empty payload.
- Assert the response contains none of the seeded tag data.

### 3. Exact success/429 accounting in the USSD burst test
Rework `ussd.concurrentburst.e2e.test.ts`:
- Track per phone: total sent (N=45), count of throttled responses (matched on the bilingual denial copy) and count of served responses; assert `served + throttled === N`, `served` falls within the documented per-phone budget window (30/min, allowing for the shared IP bucket by asserting `served <= 30` and `throttled >= N - 30`).
- Query all `rate_limit_429` rows per `phone_hash` and assert every row has `event_type === "rate_limit_429"`, `scope` in `["ussd-phone","ussd-ip"]`, and `details.menu_path` equal to the menu path that was hammered (`""` for the main menu; add a second burst against the donate path `5` and assert `menu_path === "5"`).
- Assert no 429 row for one phone carries another phone's hash (cross-phone isolation).

### 4. CI: run these suites and fail when they skip
- New job in `.github/workflows/smoke-tests.yml` (or a dedicated `e2e-security.yml`) that:
  - **Preflight-asserts the secrets exist**: fail the step immediately if `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` are unset.
  - Runs `bunx playwright test --config=playwright.e2e.config.ts` with a JSON reporter, then a small guard script that parses the report and **fails if any test status is `skipped`** (or if zero tests ran).
  - Runs the Deno USSD/e2e tests (`deno test --allow-net --allow-env supabase/functions/...`) and fails on any `ignored` test as well as failures.
- The specs keep their `test.skip(...)` guards for local runs; CI turns a skip into a hard failure via the preflight + report guard, so local developers without secrets are unaffected.

## Technical notes
- Skip detection uses Playwright's JSON reporter output (`--reporter=json`) parsed by a small `scripts/assert-no-skips.mjs`; no changes to the spec files' skip logic are needed.
- Admin user id for the audit assertion comes from the service-role client resolving the signed-in admin email, or from the restored session JSON — whichever path `login()` took.
- No database, RLS, or edge-function changes; this is test and CI work only.

## Verification
Run the e2e Playwright specs and the Deno USSD tests here and report the real output. Without `TEST_USER_*` / `TEST_ADMIN_*` and a service-role key in this sandbox they will skip; that will be reported as unverified rather than claimed as passing, and the new CI guard is exactly what turns that state red in CI.
