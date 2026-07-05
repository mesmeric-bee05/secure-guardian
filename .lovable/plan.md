# Phase 8 — Verification, CI Gate, USSD Consistency, Security Events Admin

## 1. Run M-PESA e2e tests (sandbox + production)
- Execute `supabase--test_edge_functions` for `mpesa-stk-push` and `mpesa-callback`.
- Run once with `MPESA_ENV=sandbox` and once with `MPESA_ENV=production` (override via test env setup in each `*.e2e.test.ts`; mock Daraja host per env).
- Capture failing assertions and Daraja mock responses; fix any regressions in the handlers (not the tests) if the contract drifted.
- Deliverable: green test output pasted into chat with per-test timing; any fixed handler diffs.

## 2. CI workflow for Playwright smoke tests
- New file: `.github/workflows/smoke-tests.yml`.
- Triggers: `pull_request` and `push` to `main`.
- Steps: checkout → setup-node 20 → `bun install` → `bunx playwright install --with-deps chromium` → start Vite (`bun run dev &` + wait-on `http://localhost:8080`) → run Playwright specs targeting `/support` (EN + SW, JSON-LD assertion, donation preset buttons) and `/admin` CHW Analytics tab (charts render, CSV export downloads non-empty file).
- Move existing ad-hoc smoke scripts into `tests/smoke/` as committed Playwright specs (`support.spec.ts`, `chw-analytics.spec.ts`).
- Job marked `required` via branch protection note in the workflow README; failure blocks merge.
- Upload `playwright-report/` as artifact on failure.

## 3. Consistent IP+User rate limiting on USSD branches
- `supabase/functions/ussd-handler/index.ts`: today donate/clinic use only phone-scoped buckets. Add IP-scoped bucket in parallel via `enforceLimits({ ip: getClientIP(req), userId: phoneNumber, ipLimitPerMin, userLimitPerMin })` so both dimensions are enforced.
- Standardize limits: donate 10/min per phone + 30/min per IP; clinic 20/min per phone + 60/min per IP.
- Return bilingual 429 body (EN/SW) with `Retry-After` header preserved from `enforceLimits`; keep the `END ...` USSD shape so gateways render it.
- Ensure denials continue to write `rate_limit_429` rows via existing `logSecurityEvent` path inside `enforceLimits`.
- Add burst test: `supabase/functions/ussd-handler/ussd.loadburst.test.ts` — fire 40 rapid donate hits from the same phone/IP; assert first N succeed, remainder return bilingual 429 and produce `security_events` rows. Run via `supabase--test_edge_functions`.

## 4. Security Events admin view
- New tab in Admin panel: `src/components/admin/SecurityEventsTab.tsx` (register in `AdminSidebar.tsx` + `pages/Admin.tsx`).
- Data source: existing `public.security_events` table (already RLS-restricted to admins).
- Filters: `event_type` (select from distinct values), `scope` / `menu_path` (text), phone hash (text — matches `ip_address` field when USSD masks phone there), date range (from/to).
- Table: paginated (50/page), columns: created_at, event_type, scope, severity, ip_address, user_id, details (expandable JSON).
- CSV export: reuse `CSVExportButton` pattern; server-side export via new edge function `supabase/functions/security-events-export/index.ts` (admin-only, JWT verified in code, streams CSV) so large ranges don't hit browser memory. Mirrors `reports-export` structure.
- Bilingual labels via `src/lib/translations.ts`.

## Out of scope
- No schema migrations (security_events table + RLS already exist).
- No changes to non-USSD edge functions beyond what item 1 uncovers.
- No new payment providers or visual redesign.

## Verification checklist
- Item 1: both env runs green in tool output.
- Item 2: workflow file valid (`actionlint` via CI itself); intentional failing PR blocks merge.
- Item 3: burst test asserts denials + `security_events` rows; manual `supabase--read_query` confirms `rate_limit_429` with `scope IN ('ussd-donate','ussd-clinic')` and both `ip:` and `user:` bucket keys appear.
- Item 4: admin can filter + export; non-admin gets 403 from export function; Playwright smoke covers tab render + CSV download.

## Technical notes
- Use `getClientIP(req)` from `_shared/cors.ts` for IP dimension; keep `maskPhone(phoneNumber)` as the user dimension key so PII never lands in bucket names.
- CSV export function: `verify_jwt=false` in code (matches project convention), validate admin via `has_role(auth.uid(), 'admin')` RPC before streaming.
- Playwright CI: pin Chromium via `PLAYWRIGHT_BROWSERS_PATH=0` and cache `~/.cache/ms-playwright`.
