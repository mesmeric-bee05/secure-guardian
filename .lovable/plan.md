# M-PESA Idempotency, Denial Alerting, Audit Filters & AI Chat Verification

## 1. Database-level idempotency for callback reference ids

Today replay protection is behavioural only (a donation must be `pending`). We add a
durable ledger so a repeated reference id can never be processed twice, even with a valid token.

- New table `public.mpesa_callback_events`:
  - `checkout_request_id text not null`
  - `reference_id text not null` (M-PESA receipt, or a derived key when absent)
  - `donation_id uuid`, `result_code int`, `status text`, `received_at timestamptz default now()`
  - `UNIQUE (checkout_request_id, reference_id)` — the hard idempotency constraint
  - GRANTs: `service_role` only (no anon/authenticated grants), RLS enabled, admin-read policy
  - Index on `received_at` for retention sweeps
- `mpesa-callback` inserts into this table **before** mutating the donation. A unique-violation
  means "already processed": the function acks `{ResultCode:0}`, writes an
  `mpesa_callback_duplicate` audit row, and leaves the donation untouched.
- Retention: a `purge_mpesa_callback_events(interval)` function (default 180 days) plus a
  pg_cron nightly job; expired entries are removed safely and a later replay of an expired
  reference is still blocked by the donation status guard.

## 2. Denial-spike alerting

- New DB function `mpesa_denial_spike_check(_window interval, _threshold int)` returning the
  denial count and a boolean, based on `audit_logs` rows with action `mpesa_callback_rejected`.
- New edge function `mpesa-denial-alert` (service-role, no client access): runs the check,
  writes a `security_events` row (`event_type = 'mpesa_denial_spike'`, severity `critical`)
  and an audit row, and — when `ALERT_WEBHOOK_URL` is configured — POSTs a redacted JSON
  payload (counts, window, top reasons; never tokens). Email/webhook is optional and skipped
  cleanly when unset.
- Scheduled every 5 minutes via pg_cron + pg_net.
- Verification: `supabase/functions/mpesa-denial-alert/alert.e2e.test.ts` seeds simulated denials,
  invokes the function, and asserts a `security_events` row is created and that a below-threshold
  window produces no alert.

## 3. Admin audit-log filters (rejection reason + donation id)

- `src/components/admin/AuditLogsTab.tsx`: add two filter inputs — "Rejection reason"
  (select: invalid_token, missing_token, token_not_configured, amount_mismatch,
  donation_not_pending, unknown_donation, duplicate_reference, malformed_payload,
  processing_error) and "Donation ID" (text). Reason filters on `details->>reason`,
  donation id on `resource_id`. Both compose with the existing action/search filters and
  reset pagination. Include the M-PESA actions in the action dropdown.
- E2E `tests/e2e/audit-logs-mpesa-filters.spec.ts`: seed callback outcomes (valid, invalid
  token, amount mismatch, duplicate), then assert the filtered table shows exactly the
  matching rows and nothing else.

## 4. Replay regression tests

- Extend `supabase/functions/mpesa-callback/callback.e2e.test.ts`:
  - duplicate reference id with a **valid** token is rejected and audited as duplicate,
    donation state unchanged;
  - replay still blocked while the dual-token window is open (accepted via `next`/`previous`
    slot, still refused as duplicate);
  - an expired/purged ledger entry replay is handled safely (no crash, donation not re-credited).

## 5. AI chat reliability

Server side is currently healthy (gateway request returned 200, streamed tokens), so the fault
is not yet confirmed. Work here is diagnose-then-fix:

- Reproduce a chat send in the running preview with Playwright, capturing console, network and
  the SSE response, to identify where it fails (CORS/origin rejection, rate-limit 429, or
  stream parsing).
- Harden regardless of outcome: surface the real edge-function error message and status in the
  chat UI instead of the generic fallback, log the gateway status text on non-200, add a
  request timeout with retry, and keep the assistant placeholder visible while streaming.
- Add a smoke test covering a full send/receive round-trip on `/chat`.

## Technical notes

- Migration tool for the new table, function and grants; `run_sql` for the pg_cron schedule
  (contains project-specific URL/keys).
- No token values are ever logged, audited, or sent to a webhook.
- After changes: run the callback Deno tests, the new alert test, and the Playwright suites,
  and confirm the build log is clean.
