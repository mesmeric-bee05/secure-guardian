# Finish M-PESA alerting, ops dashboard tests, and real AI chat

Picks up where the last session stopped. Each step ends with checking real output (deploy result, query, test run), not just code changes.

## 1. Alert schedules (resume point)
- Set a fresh alert token (generated and stored securely, never shown), then redeploy the denial-alert function so it reads the new value.
- Install two schedules:
  - Every 5 minutes: call the denial-alert function with the token in a header (288 runs/day; each run is a small count query, so cost is low; the longest delay before an alert is 5 minutes).
  - Nightly at 02:00 UTC: delete ledger entries older than 180 days.
- Check: list the installed schedules, trigger one run by hand, and confirm a check entry appears in the security events.

## 2. Alert spike test in CI
- Run the spike test locally against the live function. It should show that 12 simulated denials raise a critical alert and that a count below the threshold stays silent.
- Add it to the security e2e workflow, using the token from CI secrets.
- Change cleanup so it no longer tries to delete audit rows, because the audit log only accepts new entries. Simulated rows stay identifiable by a unique tag.

## 3. Seed callback outcomes and the audit-filter test
- Seed a small set of **simulated** outcomes, each tagged `simulated: true` plus a run ID: one success, one duplicate reference, one amount mismatch, one invalid token, and one unknown donation. Do this by sending real requests to the callback function, so ledger, donation and audit rows come out of the real code path. They are not presented as Safaricom traffic.
- Write `tests/e2e/audit-logs-mpesa-filters.spec.ts`. It checks the action filter, the reason filter, the donation-ID filter, combined filters, and the empty state against the seeded rows.
- Run it, and fix any filter or row mismatches it finds.

## 4. M-PESA Ops dashboard
- The tab already exists, with cards for pending, successful, denied and duplicate, plus three tables. To add:
  - a USSD burst card, counting rate-limit events from security events in the selected time window
  - a "Simulated" badge on tagged rows
- Keep the loading, empty and error states, and keep the view admin-only.

## 5. Ops dashboard e2e tests
- Write `tests/e2e/mpesa-ops-dashboard.spec.ts`. It covers:
  - row counts on the cards match the rows in the tables
  - the time-window, reason and donation-ID filters narrow the rows
  - a denied duplicate callback shows up in both the ledger and the denied table
  - a non-admin user is denied
- Add both new specs to CI and run them.

## 6. Real answers from AI chat
- In the chat function, move to the Lovable AI model `openai/gpt-5.6-sol` and keep streaming. Retry briefly on 429 and 5xx errors, and pass through clear messages for 402, 429 and other failures.
- Redeploy, then use a signed-in browser session to send a real question in the preview. Confirm a streamed answer appears and the request shows up in the AI request logs.
- Add a Playwright chat test for a successful answer and for the error message shown on failure.

## Technical notes
- Schedules are installed as direct SQL through `pg_cron`/`pg_net`, not through a migration, because they hold project-specific values.
- At the end, mark each finished task in the roadmap. Any test that cannot run, for example because a CI secret is missing, is reported with the reason.
