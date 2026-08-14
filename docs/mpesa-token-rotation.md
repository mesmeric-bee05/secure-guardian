# Rotating the M-PESA callback shared secret (zero downtime)

The M-PESA callback endpoint authenticates Safaricom by a shared secret that we
embed in the `CallBackURL` we send with every STK push.

| Secret | Used by | Purpose |
| --- | --- | --- |
| `MPESA_CALLBACK_TOKEN` | `mpesa-stk-push` (URL build) + `mpesa-callback` (verify) | The **current** token |
| `MPESA_CALLBACK_TOKEN_PREVIOUS` | `mpesa-callback` (verify only) | Accepted during the rotation overlap window |

Callbacks for pushes initiated *before* a rotation still carry the old token, so
rotating a single value would drop in-flight payments. The overlap window solves
this.

## Runbook

1. **Open the overlap.** Copy the value currently in `MPESA_CALLBACK_TOKEN` into
   a new secret `MPESA_CALLBACK_TOKEN_PREVIOUS`.
2. **Set the new token.** Generate a fresh random value (≥ 32 chars) and store it
   as `MPESA_CALLBACK_TOKEN`. New STK pushes immediately use it; old callbacks
   keep verifying against the previous value.
3. **Verify.** Call `mpesa-config-check` as an admin — the response contains
   `callback_token_rotation: { current_set, previous_set, overlap_open, identical }`.
   During rotation you expect `overlap_open: true` and `identical: false`.
4. **Wait out in-flight callbacks.** Safaricom retries for a few minutes; wait at
   least 15 minutes (or until no `mpesa-callback` log line reads
   `accepted with PREVIOUS token`).
5. **Close the overlap.** Delete `MPESA_CALLBACK_TOKEN_PREVIOUS`.
   `mpesa-config-check` should report `overlap_open: false`.

## Safety properties

- Both comparisons are constant-time; neither token is ever returned by any
  endpoint or logged.
- If **both** secrets are unset the endpoint fails closed with `503` and records
  an `mpesa_callback_rejected` audit entry with reason `token_not_configured`.
- Every rejected callback (missing token, invalid token, unknown donation,
  non-pending donation, amount mismatch, malformed payload) is written to
  `audit_logs` with the reason and the affected donation, and unauthorized
  attempts additionally raise a `critical` `security_events` row.
- Accepting a callback with the previous token emits a warning log line so the
  overlap window is observable and can be closed confidently.
