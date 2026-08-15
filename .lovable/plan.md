# M-PESA Rotation Window + Security Analytics UTC Preview

## 1. Dual-token verification window (current + next)

Today `mpesa-callback` accepts `MPESA_CALLBACK_TOKEN` plus `MPESA_CALLBACK_TOKEN_PREVIOUS` (backward-looking overlap). Add a forward-looking one so a new token can be pre-published before cutover.

- `supabase/functions/mpesa-callback/index.ts`: verify against three env values with constant-time compare — `MPESA_CALLBACK_TOKEN` (current), `MPESA_CALLBACK_TOKEN_NEXT` (accepted during pre-cutover), `MPESA_CALLBACK_TOKEN_PREVIOUS` (accepted during post-cutover drain). Tag which one matched in the log line (`current` / `next` / `previous`) and in the accepted-callback audit detail, never the token itself.
- `supabase/functions/mpesa-stk-push/index.ts`: keep building `CallBackURL` from `MPESA_CALLBACK_TOKEN` only, unless `MPESA_CALLBACK_ROTATION_STAGE=cutover`, in which case it uses `MPESA_CALLBACK_TOKEN_NEXT`. Refuse (503) if the stage-selected token is unset.
- `supabase/functions/mpesa-config-check/index.ts`: extend `callback_token_rotation` with `next_set`, `stage`, `dual_window_open`, and an `all_distinct` check so an accidental copy of the same value is visible to admins.

## 2. Environment-driven phased rotation workflow

- `scripts/mpesa-rotate-token.mjs`: a stage-driven CLI (`--stage=prepare|cutover|retire|status`) that reads/writes only the documented env var names and prints the exact next action. It never prints token values; it reports lengths and set/unset.
  - `prepare` — require `MPESA_CALLBACK_TOKEN_NEXT` to be set and distinct; dual window opens.
  - `cutover` — assert dual window open, then instruct promoting next → current and old current → previous, setting stage to `steady`.
  - `retire` — assert no `accepted with PREVIOUS token` traffic in the drain period, then clear `PREVIOUS`/`NEXT`.
  - `status` — call `mpesa-config-check` as admin and print the rotation state.
- `.github/workflows/mpesa-rotation-verify.yml`: manual (`workflow_dispatch`) job that runs the Deno callback e2e suite against the configured stage and fails if a callback signed with the stage's expected token is rejected.
- Update `docs/mpesa-token-rotation.md` to the three-phase runbook (prepare → cutover → retire) with the new env vars and verification commands.

## 3. Callback e2e tests

`supabase/functions/mpesa-callback/callback.e2e.test.ts`:

- **Dual-window acceptance**: with current + next configured, a callback carrying either token is accepted; a third random token is rejected 401.
- **Denial audit coverage**: for each rejection reason — `missing_token`, `invalid_token`, `amount_mismatch`, `unknown_donation`, `donation_not_pending` — assert exactly one `audit_logs` row with `action = 'mpesa_callback_rejected'`, the matching `details.reason`, and `resource_id` equal to the donation id where a donation is resolvable (null for missing/invalid token and unknown donation).
- **Replay regression**: send a valid, correctly-tokened callback for a pending donation, assert success; re-send the identical payload (same `CheckoutRequestID` and `MpesaReceiptNumber`) and assert the donation row is unchanged (status, receipt, amount) and a `donation_not_pending` audit row is written — no second credit.

## 4. Security Analytics UTC range preview + Playwright check

- `src/components/admin/SecurityAnalyticsTab.tsx`: render a read-only preview line under the filters, `data-testid="sec-utc-range-preview"`, showing the exact UTC window and bucket edges the export will use — first bucket label, last bucket label, and the `YYYY-MM-DDTHH:MM:SSZ` window bounds — derived from the same helper the CSV rows use so the two cannot drift.
- `tests/e2e/security-analytics-filters.spec.ts`: read the preview text, export the CSV for the same filters, and assert the first/last CSV bucket labels equal the preview's first/last labels, that every CSV bucket falls inside the previewed window, and that the preview format matches for both `day` and `hour` granularity.

## Technical notes

- All token comparisons stay constant-time; no endpoint, log, or test output ever emits a token value.
- Audit/security writes remain service-role only, so a spoofed caller cannot suppress them.
- Rotation env vars: `MPESA_CALLBACK_TOKEN`, `MPESA_CALLBACK_TOKEN_NEXT`, `MPESA_CALLBACK_TOKEN_PREVIOUS`, `MPESA_CALLBACK_ROTATION_STAGE`. Only the first is required in steady state.
