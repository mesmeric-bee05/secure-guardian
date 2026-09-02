# M-PESA Operations and AI Chat Recovery

## Goal
Complete the unfinished M-PESA verification and operations work, then repair the AI chat failure shown in the screenshot with end-to-end evidence.

## Verified current state
- The audit-log reason and donation-id controls exist, but the requested Playwright test file has not been created.
- The denial-alert function exists in source but is not deployed, no M-PESA cron jobs are registered, and no spike alert has been recorded.
- The live `donations` and `mpesa_callback_events` tables currently contain no rows, so the dashboard must handle a genuine zero-data state.
- The screenshot is from `https://preview--fortify-trust-wall.lovable.app`, which is absent from the edge-function CORS allowlist. The browser reports `Failed to fetch`, and no corresponding AI Gateway request exists, so this failure occurs before the model is called.
- AI Gateway model streams and Safaricom M-PESA callbacks are separate systems. A successful AI Gateway response cannot be treated as proof of a real Safaricom callback.

## Implementation

### 1. Audit-log M-PESA filter test
- Create `tests/e2e/audit-logs-mpesa-filters.spec.ts` using the existing admin-session and service-role seeding pattern.
- Seed uniquely tagged accepted and rejected callback audit outcomes with distinct donation IDs and reasons.
- Verify action, rejection-reason, and donation-ID filters independently and in combination; assert only the intended rows remain.
- Fix any UI/query/test-selector mismatch exposed by the run, then clean up all seeded rows.

### 2. Denial-spike alert deployment and schedule
- Harden `mpesa-denial-alert` so scheduler authentication is mandatory and database insert/webhook failures are checked and surfaced without exposing tokens.
- Deploy the function and register a five-minute `pg_cron`/`pg_net` callback plus the nightly callback-ledger retention job.
- Seed a uniquely marked simulated denial spike, invoke the deployed function, and confirm both the critical `security_events` record and audit record.
- Verify external delivery when `ALERT_WEBHOOK_URL` is configured; otherwise report the webhook as not configured while still proving the internal alert path. Do not fabricate a third-party destination.
- Update the alert verification test to avoid deleting append-only audit records and to clean up only permitted fixture data.

### 3. Admin M-PESA dashboard
- Expand the existing M-PESA admin tab into an operations dashboard while preserving configuration and STK testing.
- Add admin-only summary metrics for pending donations, successful callbacks, failed/cancelled callbacks, denied attempts, and latest callback time.
- Add compact recent tables for pending donations, callback ledger events, and denial reasons with loading, empty, refresh, and error states; redact phone numbers and avoid exposing callback secrets.
- Use a tightly scoped admin-only aggregate RPC where cross-table counts cannot be fetched reliably or efficiently under current RLS; retain the existing admin read policies for detail rows.
- Add stable test IDs and a Playwright smoke test for populated and zero-data states.

### 4. AI chat repair and real browser reproduction
- Add the active preview hostname to the strict CORS allowlist and include it in the live CORS regression suite; keep unknown origins rejected.
- Update `ai-chat` to use the supported Lovable AI Gateway server-side integration and current model contract, preserving streaming and propagating the Gateway run ID.
- Surface the actual status/message for terminal failures (`400/401/402/403`) and use bounded delayed retries only for `429/5xx`; do not add artificial request timeouts.
- Improve the browser chat hook so preflight/network, auth, JSON error, and malformed/empty stream failures are distinguishable in both the toast and assistant message. Keep a visible assistant placeholder during streaming and preserve explicit user cancellation.
- Build a Playwright reproduction from `/chat` that captures the preflight, function response, SSE tokens, visible assistant output, and console errors. Confirm the fixed request reaches the AI Gateway and cite its request log ID and timestamp.

### 5. M-PESA callback proof and regression verification
- Treat only calls to `mpesa-callback` with matching donation and ledger/audit records as callback evidence; label seeded test callbacks as simulations, not real Safaricom traffic.
- Run the callback tests, including valid-token duplicate/reference replay and rotation-window cases that are available in the configured environment.
- Run the new audit-filter and dashboard Playwright tests, alert tests, AI chat browser test, CORS suite, and focused build verification.

## Technical notes
- Database schedules containing project-specific callback details will be installed directly, not committed as portable migrations.
- Any new RPC remains admin-only, with `PUBLIC`/`anon` execution revoked and explicit authenticated/service grants.
- No private key, callback token, phone number, or webhook URL will be logged or rendered.
