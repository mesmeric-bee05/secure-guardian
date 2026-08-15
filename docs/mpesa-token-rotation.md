# Rotating the M-PESA callback shared secret (zero downtime)

The M-PESA callback endpoint authenticates Safaricom by a shared secret that we
embed in the `CallBackURL` we send with every STK push. Because callbacks arrive
minutes after the push that created them, a single-value swap would drop
in-flight payments. Rotation therefore runs in three phases with a **dual
verification window**.

| Secret / variable | Used by | Purpose |
| --- | --- | --- |
| `MPESA_CALLBACK_TOKEN` | `mpesa-stk-push` (URL build) + `mpesa-callback` (verify) | The **current** token |
| `MPESA_CALLBACK_TOKEN_NEXT` | `mpesa-callback` (verify) + `mpesa-stk-push` during `cutover` | The **incoming** token |
| `MPESA_CALLBACK_TOKEN_PREVIOUS` | `mpesa-callback` (verify only) | The **retiring** token, drains in-flight callbacks |
| `MPESA_CALLBACK_ROTATION_STAGE` | `mpesa-stk-push` | `steady` (sign with current) or `cutover` (sign with next) |

`mpesa-callback` accepts any of the three configured tokens with a constant-time
compare and records which slot matched (`current` / `next` / `previous`) in the
`mpesa_callback_accepted` audit row and in the function logs.

## Runbook

### Phase 1 — prepare (open the dual window)

1. Generate a fresh random value (≥ 32 chars) and store it as
   `MPESA_CALLBACK_TOKEN_NEXT`.
2. Run `node scripts/mpesa-rotate-token.mjs --stage=prepare`.
   It asserts the value is set, ≥ 32 chars, distinct from the current token, and
   that the deployed functions already see it (`next_set: true`).
3. Both tokens now verify. Pushes are still signed with the current token.

### Phase 2 — cutover (sign with the new token)

1. Set `MPESA_CALLBACK_ROTATION_STAGE=cutover`.
2. Run `node scripts/mpesa-rotate-token.mjs --stage=cutover`.
   It asserts `signing_with: "next"` and `all_distinct: true`.
3. New pushes carry the new token; callbacks from before the cutover keep
   verifying against the current token.

### Phase 3 — retire (close the window)

1. Wait at least 15 minutes (Safaricom's retry horizon) after cutover.
2. Copy `MPESA_CALLBACK_TOKEN_NEXT` into `MPESA_CALLBACK_TOKEN`, set
   `MPESA_CALLBACK_ROTATION_STAGE=steady`, then delete
   `MPESA_CALLBACK_TOKEN_NEXT` and `MPESA_CALLBACK_TOKEN_PREVIOUS`.
3. Run `node scripts/mpesa-rotate-token.mjs --stage=retire`. It fails unless the
   extra slots are gone and `dual_window_open: false`.

### Verification at any point

- `node scripts/mpesa-rotate-token.mjs --stage=status` prints the live
  `callback_token_rotation` block from `mpesa-config-check`
  (`stage`, `current_set`, `next_set`, `previous_set`, `dual_window_open`,
  `all_distinct`, `signing_with`) — never a token value.
- The **M-PESA Rotation Verify** GitHub workflow (`workflow_dispatch`) runs the
  same stage assertions plus the `mpesa-callback` Deno e2e suite, so a stage is
  only "done" when a real callback signed with that stage's token is accepted.

## Safety properties

- All comparisons are constant-time; no token is ever returned by an endpoint,
  logged, or printed by the rotation script (only set/unset and lengths).
- If **all three** slots are unset the endpoint fails closed with `503` and
  records an `mpesa_callback_rejected` audit entry with reason
  `token_not_configured`.
- Every rejected callback (missing token, invalid token, unknown donation,
  non-pending donation, amount mismatch, malformed payload) is written to
  `audit_logs` with the reason and the affected donation id, and unauthorized
  attempts additionally raise a `critical` `security_events` row.
- Replays are inert: only `pending` donations may transition, so a re-sent
  payload with a reused `CheckoutRequestID` produces a `donation_not_pending`
  audit row and no second credit.
