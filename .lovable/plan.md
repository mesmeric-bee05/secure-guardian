## Scope

Seven work items, all additive. No schema changes beyond one policy hardening review; RLS on `security_events` is already admin-only via `is_admin(auth.uid())`, so I'll verify and only add missing scope.

## 1. SecurityAnalyticsTab — add filters (event_type, menu_path, date range)

`src/components/admin/SecurityAnalyticsTab.tsx`
- Add three controls: `eventType` (Select populated from distinct types loaded + "All"), `menuPath` (text input, substring match against `scope` and `details->>menu_path`), and existing From/To date range.
- Push filters into the Supabase query (`.eq('event_type', ...)`, `.or('scope.ilike.%x%,details->>menu_path.ilike.%x%')`).
- Recompute `series`, `topScopes`, `topPhones`, and CSV export from filtered rows so CSV matches on-screen data.
- Add `data-testid` hooks (`sec-filter-event-type`, `sec-filter-menu-path`, `sec-filter-from`, `sec-filter-to`, `sec-export-csv`, `sec-row-count`) for reliable Playwright targeting.

## 2. Admin-only guard for the analytics view

- Client-side: wrap the tab render in `useAuth()` + `has_role('admin')` check; redirect non-admins. `AdminSidebar`/`Admin.tsx` already gate the whole `/admin` page, so this is defence-in-depth.
- DB: RLS on `security_events` already restricts `SELECT` to `is_admin(auth.uid())` and `INSERT` is denied to `anon`/`authenticated` (service role only). Confirm and add a matching admin-only policy for `security_events_purge_log` if missing. No new SECURITY DEFINER surface.

## 3. Playwright e2e — SecurityAnalyticsTab filter aggregation

`tests/e2e/security-analytics-filters.spec.ts` (new folder `tests/e2e/` + `playwright.e2e.config.ts`)
- Sign in as seeded admin via Supabase JS in a `globalSetup` (using `LOVABLE_BROWSER_SUPABASE_*` env when present, or `TEST_ADMIN_EMAIL`/`PASS`).
- Seed 6 `security_events` rows via service role: 3 `rate_limit_429` on scope `ussd-donate`, 2 `validation_failed` on `ussd-schema`, 1 `auth_failed` on `ai-chat`, all with distinct `phone_hash`es and timestamps inside a known window.
- Navigate to `/admin` → Security Analytics tab.
- Set date filter to seed window, event_type=`rate_limit_429`, menu_path=`donate`. Assert `sec-row-count` shows 3 and the stacked chart legend contains only `rate_limit_429`.
- Change event_type to All, menu_path to empty → assert row count = 6.

## 4. Playwright e2e — CSV export contents match filters

Same spec file, second test.
- Apply same filters, click Export CSV.
- Capture download via `page.waitForEvent('download')`, read to buffer, parse CSV.
- Assert: header is `bucket,event_type,count`, all rows have `event_type=rate_limit_429`, sum of `count` column equals 3, no other event types present.
- Change filter and re-export; assert new file reflects updated selection.

## 5. USSD burst 429 e2e

`supabase/functions/ussd-handler/ussd.burst429.e2e.test.ts` (new)
- Uses existing Deno test harness pattern (`ussd.securityevents.e2e.test.ts`).
- Send 130 rapid POSTs sharing one phoneNumber/IP to exceed both `ussd-ip` (120/min) and `ussd-phone` (30/min) buckets.
- Assert responses include `END Too many requests.` after threshold.
- Await `flushSecurityEvents`, then query `security_events` filtered by `event_type='rate_limit_429'` and `details->>phone_hash = sha256(phone)`. Assert: at least one row per limited scope (`ussd-ip`, `ussd-phone`), each with correct `menu_path` and matching `phone_hash`.
- Second scenario: burst on `ussd-donate` sub-flow to assert `scope='ussd-donate'` row also lands with `menu_path` prefix `5*`.

## 6. Re-run security scan + CI regression gate

- Run `security--run_security_scan` at end of implementation; expect the two target internal_ids (`jwt_sub_unchecked`, `SUPA_anon_security_definer_function_executable`) to remain absent.
- `scripts/security-regression-check.mjs` (new): reads `security/snapshots/latest.json` and fails with non-zero exit if either internal_id appears in any scanner's findings. Emits a clear "REGRESSION:" message naming the id.
- `.github/workflows/security-gate.yml`: add step `Regression check for fixed findings` after `Run security gate`, invoking the new script. Same job → merge is blocked on failure.

## 7. Non-sensitive JWT validation logs

Shared helper `supabase/functions/_shared/authLog.ts` (new) with:
- `logJwtFailure(fn: string, reason: 'missing_bearer'|'invalid_token'|'missing_sub'|'wrong_role', extras?)`: `console.warn` with structured JSON `{ fn, reason, has_auth_header, role_present, sub_present, ip_prefix }`. No token, no user id, no email — only booleans and enum reason.

Integrate in the 7 edge functions already hardened last turn (`ai-chat`, `sms-gateway`, `emergency-alert`, `notify-case-update`, `reports-export`, `security-events-export`, `audit-chain-verify`): call `logJwtFailure` on the two failure branches (missing/invalid Authorization, and post-getClaims missing-sub/wrong-role) before returning 401. Also fire-and-forget `logSecurityEvent({ event_type: 'auth_failed', scope: fn, details: { reason } })` so failures show up in the analytics tab.

## Technical notes

- No new DB tables. One optional policy verification on `security_events_purge_log`.
- Filter query uses PostgREST `.or()` on `scope.ilike` and `details->>menu_path.ilike`; both are indexable via existing btree/GIN — no new index required for expected data volume.
- E2E tests requiring an admin session depend on `LOVABLE_BROWSER_SUPABASE_*` env vars in CI; if absent, the spec is `test.skip`ed with a clear message so the workflow stays green in forks.
- New CI step is deliberately narrow: only checks for the two internal_ids the user pinned. Other regressions still flow through the existing gate.

## Verification

1. `bun run test` (Vitest) — no frontend regressions.
2. `supabase--test_edge_functions` on `ussd-handler` — new burst + validation tests pass.
3. `bunx playwright test --config=playwright.e2e.config.ts` locally against dev server with seeded admin — filter + CSV specs pass.
4. `security--run_security_scan` — confirm both fixed findings remain gone; then `node scripts/security-regression-check.mjs` exits 0.

## Out of scope

- No changes to rate-limit thresholds.
- No new admin dashboards beyond the filter additions to the existing tab.
- No log shipping / external SIEM integration — logs stay in edge-function console + `security_events` table.
