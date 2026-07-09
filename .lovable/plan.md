# Phase 10 — USSD Schema Validation & Security Analytics

Prior phases already delivered durable `logSecurityEventSync` + `withSecurityEventFlush`, phone-hash/menu-path enrichment on USSD denials, and an e2e burst test (`ussd.securityevents.e2e.test.ts`). This phase closes the remaining items: strict top-level USSD schema validation, a validation-focused e2e test, and an admin analytics panel over `security_events`.

## 1. Strict schema validation for USSD handler

File: `supabase/functions/ussd-handler/index.ts`

- Define a Zod schema for the Africa's Talking form payload:
  - `sessionId`: `z.string().min(1).max(100).regex(/^[a-zA-Z0-9\-_]+$/)`
  - `phoneNumber`: `z.string().min(6).max(20).regex(/^\+?[0-9]+$/)`
  - `text`: `z.string().max(160).regex(/^[0-9*#]*$/)`
  - `serviceCode`: `z.string().max(20).optional()`
  - `networkCode`: `z.string().max(20).optional()`
- Convert `formData` to a plain object and run `schema.strict().safeParse(...)` so unexpected keys are rejected.
- On failure:
  - Compute `phoneHash` from the raw phone if present (else `"unknown"`).
  - `await logSecurityEventSync({ event_type: "validation_failed", scope: "ussd-schema", ip_address: getClientIP(req), details: { phone_hash, menu_path: sanitized text prefix, fields: Object.keys(raw), issues: parsed.error.issues.map(i => i.path.join('.')) } })`.
  - Return `END Invalid request.` (bilingual fallback English only, since we can't trust language field).
- Keep existing per-branch sanitizers as defense-in-depth after schema passes.

## 2. E2E test: validation + missing-field failures

New file: `supabase/functions/ussd-handler/ussd.validation.e2e.test.ts`

Cases (each asserts a `security_events` row within 5s using service-role client, matching `event_type`, `scope`, `details->>phone_hash`, `details->>menu_path`):

1. Missing `phoneNumber` → expect `scope=ussd-schema`, `event_type=validation_failed`, phone_hash `unknown`.
2. Missing `sessionId` → same scope.
3. Unexpected extra field (`text`, valid + extra `evil=1`) → `scope=ussd-schema`, phone_hash present.
4. Bad `text` characters (letters) → `scope=ussd-schema`.
5. Invalid donate amount (`5*99999`) — regression check that per-branch `scope=ussd-donate` `validation_failed` still fires.

Uses `flushSecurityEvents()` between cases and the same `waitForRow` helper pattern already in `ussd.securityevents.e2e.test.ts`.

## 3. Admin analytics panel for security_events

New file: `src/components/admin/SecurityAnalyticsTab.tsx`

- Uses existing `SecurityEventsTab` patterns (auth, admin gate via `is_admin`).
- Filters: date range (default last 7 days), granularity (hour/day) via `<Select>`.
- Queries (client-side aggregation via `supabase.from('security_events').select('event_type, scope, created_at')` in date range, capped at 5000 rows; if hit, warn user to narrow range).
- Charts (Recharts, tokens from `index.css`, no hardcoded colors):
  - Stacked bar: counts per bucket (day/hour) grouped by `event_type`.
  - Horizontal bar: top 10 `scope` (menu_path proxy) by count.
  - Small table: top 10 `details->>phone_hash` occurrences (only for admins; hashed, so PII-safe).
- CSV export button: reuses `CSVExportButton` if compatible, otherwise inline `Blob` download. Columns: `bucket, event_type, scope, count`.
- Register the new tab in `src/pages/Admin.tsx` and `src/components/admin/AdminSidebar.tsx` alongside `SecurityEventsTab`.

## 4. Verification

- `supabase--test_edge_functions` on `ussd-handler` running the new validation test file plus the existing burst test.
- `supabase--read_query` sanity check:
  `select event_type, scope, count(*) from security_events where created_at > now() - interval '10 minutes' group by 1,2 order by 3 desc`.
- Manual Playwright pass on `/admin` → Security Analytics tab: date range change, chart renders, CSV downloads.

## Technical notes

- No DB migrations required — `security_events.details` is `jsonb`, `scope` and `event_type` are already indexed via existing admin queries.
- Analytics tab is read-only; relies on existing RLS on `security_events` (admin-only SELECT).
- Zod already imported in USSD handler.
- Keep total plan surface small: no changes to rate limiter, no new edge functions.
