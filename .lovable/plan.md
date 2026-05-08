# Security Events: Filters, Retention & Test Coverage

Four focused workstreams, all building on the existing `security_events` table, `_shared/rateLimit.ts`, `_shared/validation.ts`, and `SecurityEventsTab.tsx`.

## 1. Dashboard filtering + CSV export

Update `src/components/admin/SecurityEventsTab.tsx`:

- Add a filter bar above the stat cards:
  - **Event type** select: `all | rate_limit_429 | validation_failed | suspicious | auth_failed`
  - **Scope** select: dynamically populated from the current result set (plus free-text search)
  - **IP** text input (substring match, debounced)
  - **User ID** text input (UUID, exact match)
  - **Severity** select: `all | info | warn | critical`
- Filters apply both to the recent-events table and to a new query that drives totals/chart for the current filter set.
- Push filters into the Supabase query (`ilike` for IP/scope, `eq` for type/severity/user) so we don't blow past the 1000-row cap when investigating.
- Add an **Export CSV** button (reuse the pattern from `src/components/reports/CSVExportButton.tsx`) that exports the currently-filtered events with columns: `created_at, event_type, scope, severity, ip_address, user_id, details (JSON)`.
- Empty/loading states updated for filtered views.

No backend changes required for this step — RLS already restricts `security_events` to admins.

## 2. Retention + indexes for `security_events`

New migration:

- Indexes (all `IF NOT EXISTS`):
  - `(created_at DESC)` — primary dashboard sort
  - `(event_type, created_at DESC)` — type-filtered queries
  - `(scope, created_at DESC)` — scope-filtered queries + chart aggregation
  - `(ip_address, created_at DESC)` WHERE `ip_address IS NOT NULL` — top-IP RPC
  - `(user_id, created_at DESC)` WHERE `user_id IS NOT NULL`
- Retention via scheduled cleanup (simpler and safer than partitioning for current volume):
  - SECURITY DEFINER function `purge_security_events(_older_than interval default '90 days')` that deletes old rows.
  - `pg_cron` job (if extension available) running daily at 03:00 UTC to call it; if `pg_cron` is not enabled in this project, fall back to a lightweight in-RPC opportunistic purge (≈1% sampled, same pattern as `consume_rate_limit`).
- Same treatment for the `rate_limit_buckets` table indexing if needed (already cleaned lazily, just confirm).

## 3. End-to-end 429 tests across multiple public edge functions

New file `supabase/functions/_shared/rateLimit.e2e.test.ts` (uses Deno + `dotenv/load.ts`, run via `supabase--test_edge_functions`):

- Iterates over a list of public endpoints: `ai-chat`, `emergency-alert`, `sms-webhook`, `ussd-handler`, `chw-location-update`.
- For each: bursts requests above the configured limit using a unique fake IP via `x-forwarded-for` header so tests don't pollute real buckets.
- Asserts at least one response returns:
  - `status === 429`
  - `Retry-After` header present and numeric > 0
  - `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers present
  - JSON body contains `retry_after_seconds: number` and `error: string`
- Each request body uses the minimal valid payload for that endpoint to ensure we hit the limiter, not the validator.

## 4. Integration tests for validation → 400 + logged event

New file `supabase/functions/_shared/validation.e2e.test.ts`:

- For 3 endpoints with strict Zod schemas (`ai-chat`, `chw-location-update`, `emergency-alert`):
  - Send a deliberately invalid body (extra field, wrong type, out-of-range lat/lng).
  - Assert response `status === 400`, JSON body has `error: string`.
  - Poll `security_events` (via service-role client) for up to 5s to find a row with `event_type='validation_failed'` and `scope` matching the endpoint, then assert `details.error` and `details.issues` are populated.
- Cleanup: delete the inserted test rows at end of each test (filtered by a unique scope tag we inject through `x-test-tag` if helpful, otherwise by `created_at >= testStart` and matching scope).

## Technical Details

- All new tests follow the existing pattern in `rateLimit.test.ts`: `import "https://deno.land/std@0.224.0/dotenv/load.ts"` and read `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (+ `SUPABASE_SERVICE_ROLE_KEY` for verification queries) from env. Always `await response.text()` to avoid Deno resource leaks.
- CSV export uses client-side blob download; no new edge function needed.
- Migration uses `CREATE INDEX CONCURRENTLY` only outside transactions — since Lovable migrations run in a transaction, use plain `CREATE INDEX IF NOT EXISTS`.
- Retention default 90 days, configurable by passing an interval to `purge_security_events`.

## Files to change

- Edit `src/components/admin/SecurityEventsTab.tsx` (filters + CSV)
- New migration: indexes + `purge_security_events` function + optional `pg_cron` schedule
- New `supabase/functions/_shared/rateLimit.e2e.test.ts`
- New `supabase/functions/_shared/validation.e2e.test.ts`

No edge-function source changes needed — existing `enforceLimits` and `badRequest` already emit the required headers and security events.
