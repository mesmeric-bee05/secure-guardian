# Plan: Retention purge + streaming CSV export wiring + tests

Four tightly related changes across the Security Events feature.

## 1. Scheduled `purge_security_events` cron + dashboard surface

**Enable extensions + schedule (via `supabase--insert`, not migration — contains anon key):**
- Ensure `pg_cron` and `pg_net` extensions are enabled.
- Schedule `purge-security-events-daily` at `15 3 * * *` UTC, calling `public.purge_security_events('90 days')` directly via SQL (no HTTP needed — function is in the same DB). Use `cron.schedule(name, schedule, $$ SELECT public.purge_security_events('90 days'::interval); $$)`. Guard with `cron.unschedule` if exists.
- Add a `purge_log` table (`id`, `ran_at`, `deleted_count`, `retention`) and wrap purge in a small SQL wrapper `run_security_events_purge()` that inserts a row and returns the count. Update cron to call the wrapper.

**Migration (schema only):**
- Create `public.security_events_purge_log` table + RLS (admins SELECT only, deny writes).
- Create `public.run_security_events_purge()` SECURITY DEFINER wrapper.
- Create `public.security_events_retention_status()` returning `{ retention_days, last_run_at, last_deleted, oldest_event_at, total_rows }` for the dashboard.

**Dashboard (`SecurityEventsTab.tsx`):**
- New small "Retention" card at top of the tab: shows retention window (90d), last purge time + deleted count, oldest event timestamp. Calls `supabase.rpc('security_events_retention_status')`.

## 2. Streaming CSV export — frontend wiring + progress UI

**`SecurityEventsTab.tsx`:**
- Replace the existing client-side CSV blob assembly. The "Export CSV" button now calls the `security-events-export` edge function via raw `fetch` (so we can stream and track progress) using `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/security-events-export` with the user's access token + `apikey` header.
- POST body = current active filters + `since` window.
- Use `response.body.getReader()` to read chunks, count `\n` to update a "rows received" counter, accumulate into a `Blob`, then trigger download with `Content-Disposition`'s suggested filename (parsed from header; fallback to timestamped name).
- Progress UI: while streaming, swap the button for an inline state showing a small spinner, `rows received: N`, bytes (formatted), and a Cancel button (uses `AbortController`). On 403/429/4xx, parse JSON body and toast the error (include `Retry-After` value in the toast for 429s).
- A11y: announce progress via `aria-live="polite"` on the status region.

**Reusable helper:** extract download logic into `src/lib/streamingDownload.ts` (`streamCsvDownload({ url, token, body, signal, onProgress })`) so it stays testable and the component stays focused.

## 3. Integration tests for `security-events-export`

**New file:** `supabase/functions/security-events-export/export.e2e.test.ts`

Each test loads `.env` via `https://deno.land/std@0.224.0/dotenv/load.ts` and hits the deployed endpoint via `fetch`. Tests:

1. **No auth → 401** with JSON `{error}` and CORS headers present.
2. **Invalid bearer → 401** (random token).
3. **Non-admin user → 403** — sign in as a regular test user via `supabase.auth.signInWithPassword` (creds from env: `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`); skip with `Deno.test.ignore` if env not set so the suite stays green in fresh checkouts.
4. **Admin happy path → 200** streaming `text/csv`, header row matches `created_at,event_type,scope,severity,ip_address,user_id,details`, `Content-Disposition` includes `attachment; filename="security-events-...csv"`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. Drain body with `await res.text()`.
5. **Validation failure → 400** when `since` is missing/not ISO; logs `validation_failed` to `security_events`.
6. **Rate limit → 429** — burst 12 calls in parallel as admin (limit is 5/min/IP, 10/min/user). Assert at least one response has status 429, `Retry-After > 0`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` headers, and JSON body with `retry_after_seconds` + `error`.
7. After each test that triggers logging: `await flushSecurityEvents()`.

`sanitizeOps`/`sanitizeResources: false` because of long-lived sockets across parallel calls (matches existing e2e pattern).

## 4. Files

**New**
- `supabase/functions/security-events-export/export.e2e.test.ts`
- `src/lib/streamingDownload.ts`

**Edit**
- `src/components/admin/SecurityEventsTab.tsx` (CSV button → streaming + progress UI; retention status card)

**DB**
- Migration: `security_events_purge_log` table + RLS, `run_security_events_purge()`, `security_events_retention_status()`.
- `supabase--insert`: enable `pg_cron`/`pg_net`, unschedule old job if exists, schedule daily `run_security_events_purge` at 03:15 UTC.

## 5. Verification

1. `supabase--insert` schedules the cron; manually invoke `SELECT public.run_security_events_purge();` once and confirm a `security_events_purge_log` row appears.
2. Dashboard shows the new Retention card with last-run timestamp + deleted count.
3. Click Export CSV with a filter set → spinner + "rows received" counter visible → file downloads with the expected name; cancel mid-stream aborts cleanly.
4. `supabase--test_edge_functions({ functions: ["security-events-export"] })` → all tests pass (skipped tests OK if test creds not configured), exit 0.
5. `supabase--curl_edge_functions` POST with no auth → 401; with admin auth + valid `since` → CSV stream with correct headers.
