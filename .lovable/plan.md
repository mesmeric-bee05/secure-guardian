# Plan: Secure CSV export, cursor pagination, and test-leak fix

Three focused changes. All scoped to the Security Events feature + test infra.

## 1. Server-side CSV export edge function (admin-only, streaming)

**New file:** `supabase/functions/security-events-export/index.ts`

- POST endpoint, CORS via `_shared/cors.ts`, rate-limited via `enforceLimits` (scope `security-events-export`, 5 req/min per IP, 10/min per user).
- Auth: requires Bearer JWT. Resolve user with anon-key client, then call `is_admin(_user_id)` via service-role RPC. Non-admins → 403 (also logs `auth_failed` security event).
- Body schema (Zod, strict): `since` (ISO datetime), `eventType?`, `severity?`, `scopeContains?`, `ipContains?`, `userId?` (uuid). Mirrors dashboard filters.
- Hard cap: max 50,000 rows per export (`MAX_ROWS`). Page through service-role client in batches of 1,000 keyset-paginated by `(created_at desc, id desc)`. Stop early at cap and append a trailing `# truncated_at_max_rows=50000` comment row.
- Response is a streamed `text/csv` body using a `ReadableStream` controller — write header row, then enqueue each batch as it arrives (no buffering full result set in memory). Headers include `Content-Disposition: attachment; filename="security-events-<ISO>.csv"`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.
- All filter activity logged to `audit_logs` (action `security_events_export`, details = filters + row count).

**`supabase/config.toml`:** add `[functions.security-events-export]` with `verify_jwt = false` (we validate the JWT in code, same pattern as siblings).

**Frontend wiring (`src/components/admin/SecurityEventsTab.tsx`):**
- "CSV" button now calls the edge function via `supabase.functions.invoke('security-events-export', { body: <filters+since> })` with `responseType: 'blob'`-style handling (use `fetch` against `${VITE_SUPABASE_URL}/functions/v1/...` with the user's access token to keep streaming).
- Replace the existing client-side blob assembly. Show a small spinner + toast on download; surface 403/429 messages from the response body.

## 2. Cursor-based pagination for Security Events

All in `src/components/admin/SecurityEventsTab.tsx`:

- State: `pages: SecurityEventRow[][]`, `cursor: { created_at: string; id: string } | null`, `hasMore: boolean`, `pageSize = 100`.
- Replace single `events` query with a `loadPage(reset)` function:
  - Builds query with the same filters, applies window `gte('created_at', since)`.
  - When a cursor exists and not `reset`: add `.or('created_at.lt.<ts>,and(created_at.eq.<ts>,id.lt.<id>)')` for stable keyset ordering.
  - Orders by `created_at desc, id desc`, limits to `pageSize + 1` to detect `hasMore`.
- Filter/window changes → `reset=true`, clear cursor and pages.
- "Load older events" button below the table appears when `hasMore`. Disabled while loading.
- Stat cards, chart, and Top-IPs table remain computed from currently-loaded pages (label them "across loaded events"). CSV export ignores pagination — uses the new server endpoint with the active filters.

## 3. Fix the leaky `securityLog` resource in tests

Root cause: `logSecurityEvent` is fire-and-forget; in tests the unawaited `supabase-js` fetch + Postgres keep-alive trips Deno's resource sanitizer in suites that don't already set `sanitizeOps/Resources: false`. We're papering over it everywhere instead of fixing it once.

**`supabase/functions/_shared/securityLog.ts`:**
- Add a module-level `Set<Promise<unknown>>` of in-flight inserts.
- Track each `.then(...).finally(() => pending.delete(p))` and export `flushSecurityEvents(): Promise<void>` (`Promise.allSettled([...pending])`).
- In tests, callers can `await flushSecurityEvents()` to drain; production paths still don't await.
- Detect test mode via `Deno.env.get('DENO_TESTING') === '1'` (set in test runner) and, when set, also wrap the supabase-js client construction with `{ global: { fetch } }` using a fetch that calls `signal.addEventListener('abort', …)` cleanup so connections close deterministically.

**Test files updated to await flush in teardown:**
- `supabase/functions/_shared/rateLimit.test.ts`
- `supabase/functions/_shared/rateLimit.e2e.test.ts`
- `supabase/functions/_shared/validation.e2e.test.ts`

Each test that triggers logging gets a trailing `await flushSecurityEvents()`. Once the leak source is drained we re-enable Deno's default `sanitizeOps: true` / `sanitizeResources: true` on the rate-limit unit tests (the e2e tests keep them disabled because they intentionally hold long-lived sockets across many parallel calls). Verify by running `supabase--test_edge_functions` with no filter — exit code must be 0.

## Files

- **New:** `supabase/functions/security-events-export/index.ts`
- **Edit:** `supabase/config.toml` (add function block), `src/components/admin/SecurityEventsTab.tsx`, `supabase/functions/_shared/securityLog.ts`, `supabase/functions/_shared/rateLimit.test.ts`, `supabase/functions/_shared/rateLimit.e2e.test.ts`, `supabase/functions/_shared/validation.e2e.test.ts`

## Verification

1. `supabase--deploy_edge_functions(["security-events-export"])` then `supabase--curl_edge_functions` as non-admin → 403, as admin with filters → CSV stream.
2. Manually paginate in the dashboard preview; confirm filters persist and "Load older" stops when `hasMore=false`.
3. `supabase--test_edge_functions({})` → exit 0, no resource-leak warnings.

No DB migrations required — existing `security_events` indexes already cover `(created_at, id)` ordering and filter columns.
