## Goals

1. **Durable rate limiting** backed by Postgres (survives cold starts, shared across instances)
2. **Validation audit + hardening** of every edge function with Zod (strict schemas, length caps, `.strict()` to reject unknown fields)
3. **Best-effort IP+user token-bucket** on every public endpoint with proper 429 + `Retry-After`
4. **Rotate all server API keys** and confirm no secret leaks to the client

---

## 1. Durable Rate Limiting (Postgres-backed)

Create a shared `rate_limit_buckets` table + `consume_rate_limit` SQL function (atomic token bucket via `UPDATE ... RETURNING`). Counters persist across cold starts and are consistent across all edge function instances.

```text
rate_limit_buckets
  bucket_key TEXT PK     -- e.g. "ai-chat:ip:1.2.3.4" or "ai-chat:user:<uuid>"
  tokens     NUMERIC
  updated_at TIMESTAMPTZ
```

`consume_rate_limit(key, capacity, refill_per_sec, cost)` returns `{allowed, remaining, retry_after_seconds}` — all logic inside one atomic SQL call. RLS deny-all (service role only).

Shared helper: `supabase/functions/_shared/rateLimit.ts` — wraps the RPC, derives keys from IP (`x-forwarded-for`) and authenticated user id, returns a 429 JSON response with `Retry-After` header when blocked.

Per-endpoint defaults (tunable):

| Function | IP/min | User/min |
|---|---|---|
| ai-chat | 20 | 30 |
| sms-gateway | 10 | 20 |
| sms-webhook | 60 | — |
| ussd-handler | 30 | — |
| emergency-alert | 10 | 15 |
| chw-location-update | 60 | 30 (already 1/30s) |
| send-push-notification | 60 | — (service-role only) |
| notify-case-update | 30 | 30 |
| sms-retry | 10 | — |

---

## 2. Validation Audit (Zod everywhere)

Add `_shared/validation.ts` with reusable Zod primitives (phone, uuid, language, bounded text). For each function, define a `BodySchema = z.object({...}).strict()` so unknown fields are rejected. Length caps on every string. Numeric range checks on coordinates.

Audit checklist per function:

- `ai-chat` — verify schema covers `messages[].role/content`, `language`, `sessionId`; cap message count + content length; `.strict()`
- `sms-gateway` — phone E.164 regex, message ≤ 160 chars (or document multi-part), `.strict()`
- `sms-webhook` — provider payload schema, signature/source check
- `sms-retry` — admin-only, validate `messageId`
- `ussd-handler` — `sessionId`, `phoneNumber`, `text` length cap, `.strict()`
- `emergency-alert` — symptoms text cap, lat/lng range, optional notes cap
- `chw-location-update` — already validates lat/lng; add `.strict()` and reject extra fields
- `send-push-notification` — title/body length caps, `data` size cap
- `notify-case-update` — uuid for case_id, enum for new_status (already partial)

Client-side: confirm `src/lib/validations.ts` Zod schemas mirror server caps for: profile, emergency contact, onboarding, chat input (already 2000 char cap), SOS form. Add any missing `.max()`/`.strict()`.

---

## 3. 429 Response Contract

Every public endpoint returns:
```json
{ "error": "Rate limit exceeded", "retry_after_seconds": <n> }
```
with headers `Retry-After: <n>`, `X-RateLimit-Remaining: <n>`. Replace existing in-memory `Map`-based limiters in `chw-location-update`, `notify-case-update`, `send-push-notification` with the shared Postgres helper.

---

## 4. Secret Rotation & Client Exposure Audit

- Run `supabase--rotate_api_keys` (rotates anon + service role; updates `.env` automatically)
- Run `ai_gateway--rotate_lovable_api_key` (rotates `LOVABLE_API_KEY`)
- Grep audit: confirm only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` appear under `src/`. Verify no `SERVICE_ROLE`, `LOVABLE_API_KEY`, `AFRICAS_TALKING_*`, `VAPID_PRIVATE_KEY` references in client code.
- VAPID public key may stay client-side (it's public by design); private key stays server-only — confirm.

⚠️ Rotation invalidates the current anon key immediately. Active browser sessions will need to reload. Confirm you want to proceed now vs. during a maintenance window.

---

## Technical Details

- **Migration**: creates `rate_limit_buckets` table (RLS deny-all), `consume_rate_limit(text, int, numeric, int)` SECURITY DEFINER function, and an index on `updated_at` for periodic cleanup. A `pg_cron`-free cleanup runs lazily inside the RPC (deletes rows older than 1 hour with full tokens).
- **Shared modules**: `supabase/functions/_shared/rateLimit.ts`, `supabase/functions/_shared/validation.ts`, `supabase/functions/_shared/cors.ts` (consolidate the duplicated `getCorsHeaders` already present in 4+ functions).
- **Edge function changes**: each function imports from `_shared/`, replaces ad-hoc validation + in-memory limiter with shared versions. Behavior stays identical for happy path; only failure modes (429/400) get more consistent.
- **No frontend behavior changes** beyond CSRF/Zod tightening — chat, SOS, dashboards continue to work.

---

## Out of Scope

- Redis (Postgres is sufficient at current scale and avoids a new infra dependency)
- Distributed quotas across regions
- WAF-level rate limiting (handled by Lovable/Supabase platform)

---

## Confirmations needed before I implement

1. Proceed with **immediate** key rotation? (will invalidate current sessions)
2. OK with **Postgres-backed** rate limiting (vs. waiting for first-class infra)?
3. Default limits in the table above acceptable, or want different numbers?
