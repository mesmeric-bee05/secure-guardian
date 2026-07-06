## Goal
Make USSD security event logging durable so 429/validation incidents always land in `security_events`, and prove it with an e2e burst test.

## Root cause
`logSecurityEvent` in `supabase/functions/_shared/securityLog.ts` is fire-and-forget: it kicks off an async insert and returns immediately. In the USSD path we then `return new Response(...)` synchronously, so the edge runtime tears the isolate down before the insert flushes. The existing `flushSecurityEvents()` helper is only awaited in tests, never in production request handlers.

## Changes

### 1. Reliable-write logger (`supabase/functions/_shared/securityLog.ts`)
- Keep the `pending` set and `flushSecurityEvents()` for test parity.
- Add `logSecurityEventSync(ev)` that awaits the insert with a short timeout (1500 ms) and, on failure, retries once, then falls back to `console.error` with a structured tag `SECURITY_EVENT_FALLBACK` so logs remain forensically recoverable.
- Add `withSecurityEventFlush(handler)` wrapper: runs the handler, then `await flushSecurityEvents()` inside a `try/finally` before the response is returned. This guarantees any fire-and-forget calls drain before isolate shutdown.
- Insert payload gains a stable `menu_path` field (already passed in `details`) and a `phone_hash` field (SHA-256 hex of the raw phone, computed via `crypto.subtle.digest`) so tests can assert on a deterministic value without storing PII.

### 2. USSD handler (`supabase/functions/ussd-handler/index.ts`)
- Wrap the `serve` handler body with `withSecurityEventFlush` so every response (including early 429 returns from `enforceLimits`) waits for pending inserts.
- Switch the two explicit `logSecurityEvent` calls (donate + clinic validation failures) to `await logSecurityEventSync(...)` so denials are guaranteed persisted before the USSD "END ..." body is returned.
- Add `phone_hash` (hashed `phoneNumber`) into the `details` of every security event emitted from this function, alongside the existing `menu_path`.

### 3. Rate limiter (`supabase/functions/_shared/rateLimit.ts`)
- In `enforceLimits`, change the denial log to `await logSecurityEventSync(...)` and include `menu_path` (from a new optional `opts.menuPath`) plus `phone_hash` (from a new optional `opts.userIdHash`) so the burst test can filter precisely.
- Pass `menuPath` and `userIdHash` from the USSD handler at every `enforceLimits` call site (donate, clinic, ip, phone). Non-USSD callers keep working because both fields are optional.

### 4. E2E burst test (`supabase/functions/ussd-handler/ussd.securityevents.e2e.test.ts`)
- New Deno test. Uses service-role client via `SUPABASE_SERVICE_ROLE_KEY` from `.env` (loaded via `dotenv/load.ts`).
- Generates a fresh phone, computes its SHA-256 hash locally.
- Fires 25 donate requests (`text=5*500`) at the deployed `ussd-handler` in a tight loop.
- Asserts responses include at least one bilingual throttle body.
- Queries `security_events` where `event_type='rate_limit_429'`, `scope='ussd-donate'`, `details->>'phone_hash' = <hash>`, `created_at >= testStart`; asserts `count >= 1`.
- Repeats for clinic (`text=2`, 35 hits, `scope='ussd-clinic'`).
- Also asserts a `validation_failed` row lands when firing `text=5*abc` once (invalid donate amount) — filtered by `details->>'menu_path'`.
- Calls `flushSecurityEvents()` at the end for sanitizer cleanliness.

### 5. Config
- No schema migration required — `security_events.details` is already `jsonb`, so adding `menu_path` / `phone_hash` keys is transparent.
- `verify_jwt = false` already set for `ussd-handler`.

## Out of scope
- No changes to the admin `SecurityEventsTab` UI (already filters on `details` JSON).
- No changes to non-USSD edge functions beyond the optional new params on `enforceLimits`.
- No new tables or queue infra — awaiting the insert within the request (with `withSecurityEventFlush` as safety net) is sufficient given <5 ms typical insert latency and the token-bucket already caps write volume.

## Verification
- Run `supabase--test_edge_functions` targeting `ussd-handler` — new burst test must pass.
- Manual `supabase--read_query`: `SELECT scope, count(*) FROM security_events WHERE created_at > now() - interval '5 min' AND event_type='rate_limit_429' GROUP BY 1` shows both `ussd-donate` and `ussd-clinic` rows.
- Existing `ussd.loadburst.test.ts` continues to pass.
