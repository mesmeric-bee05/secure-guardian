# M-PESA Operations, Alerting and AI Chat Recovery

Five workstreams, each finished with a test that proves it.

## 1. Denial alerting: deploy, schedule, verify

- Deploy the `mpesa-denial-alert` function (it exists in the repo but is not deployed yet).
- Install two schedules through the database scheduler:
  - every 5 minutes: call the alert function with the trigger token in a header, never in the URL;
  - nightly: purge old callback ledger rows.
- Add the alert test to the CI security workflow so a simulated spike is exercised on every run.
- Run `alert.e2e.test.ts` here: seed above-threshold denials, confirm one critical security event plus one audit row, confirm a below-threshold window stays silent, clean up the seeded rows.

## 2. Admin M-PESA operations dashboard

New tab in the admin panel ("M-PESA Ops", alongside the existing M-PESA config tab):

- Summary cards: pending donations, completed donations, denied callback attempts, duplicate references — each over a selectable window (24h / 7d / 30d).
- Pending donations table: amount, phone (masked), checkout id, age.
- Callback ledger table from `mpesa_callback_events`: reference, checkout id, result code, status, received time.
- Denied attempts table from `audit_logs` (`mpesa_callback_rejected`), grouped reason chips that act as filters.
- Filters shared across tables: window, status, reason, donation id; all reset paging.
- Admin-only, reusing the existing role check; empty states rendered explicitly.

## 3. AI chat repair

Confirmed so far: the failing send produced no AI Gateway request, so the call is refused before the model. The exact refusal point is not yet proven.

- Reproduce in the real browser against the running app with an authenticated session, capturing console, network and the response body for the chat call.
- Fix what the reproduction shows. The most likely cause is origin rejection: the allowlist is a fixed list of three URLs, so any other preview/sandbox origin gets a 403 with no CORS headers. Replace it with a pattern rule that accepts Lovable preview/sandbox/published origins and localhost, keeping the extra-origins env override.
- Surface real failures: show the function's own error text and status instead of the generic "Sorry, there was an error", keep the streaming placeholder visible, and add a request timeout with one retry.
- Re-run the reproduction to confirm a full answer streams in.

## 4. Seed real callback outcomes and run the filter test

- Seeding script that drives the deployed callback function with a signed token to produce genuine outcomes: accepted, invalid token, amount mismatch, duplicate reference, unknown donation — each tied to a test-marked donation.
- Write `tests/e2e/audit-logs-mpesa-filters.spec.ts`: sign in as admin, open Audit Logs, filter by each reason and by donation id, assert the visible rows match the seeded outcomes exactly and that a non-matching filter shows the empty state.
- Run it, fix any mismatch between what the callback writes and what the filter queries.

## 5. Operations view e2e coverage

- `tests/e2e/mpesa-ops-dashboard.spec.ts`: admin sees the counts matching seeded data; each filter narrows the tables correctly; a non-admin is refused.
- Extend USSD burst coverage into the same view so a burst shows up as rate-limit events.
- Wire both into the existing e2e workflow with artifact upload.

## Technical notes

- Schedules go in via `run_sql` (they embed project-specific URL and keys), not a migration.
- `ALERT_TRIGGER_TOKEN` already exists; no token value is ever logged, audited or sent to a webhook.
- Ledger reads stay admin-only; the dashboard uses the existing RLS policies, no new grants.
- Closing checks: callback Deno tests, alert test, both Playwright suites, and a clean build log.
