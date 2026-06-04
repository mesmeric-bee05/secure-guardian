# Phase 2 — Database & Content Migrations + Cross-cutting Hardening

Scope covers four work-streams. All DB structure goes through `supabase--migration`; data seeding through `supabase--insert`. Edge function changes deploy automatically.

---

## Work-stream A — Phase 2 DB & content migrations

### A1. Migration: protocol schema normalization
File: `supabase/migrations/<ts>_protocols_normalize.sql`
- `ALTER TABLE public.first_aid_protocols`
  - Add `red_flags_en text[] NOT NULL DEFAULT '{}'`, `red_flags_sw text[] NOT NULL DEFAULT '{}'`.
  - Add `seek_help_en text[] NOT NULL DEFAULT '{}'`, `seek_help_sw text[] NOT NULL DEFAULT '{}'`.
  - Add `reference_books jsonb NOT NULL DEFAULT '[]'::jsonb` (array of `{title, author, url, lang}`).
  - Add `video_url text`, `video_provider text CHECK (video_provider IN ('youtube','vimeo','mp4') OR video_provider IS NULL)`.
  - Normalize `steps` to canonical `jsonb` shape `[{order:int, en:text, sw:text}]`. Add CHECK `jsonb_typeof(steps)='array'`.
- Backfill `UPDATE` to coerce legacy `{en:[], sw:[]}` rows into the canonical array using `jsonb_array_elements` + `generate_series`.
- Re-apply RLS grants if any policy was dropped (none expected); add `GRANT SELECT` to `anon, authenticated` (already public-read).

### A2. Migration: onboarding completion enforcement
File: `supabase/migrations/<ts>_profiles_onboarding.sql`
- `ALTER TABLE public.profiles`
  - Add `onboarding_completed boolean NOT NULL DEFAULT false` (if missing).
  - Add `onboarding_step smallint NOT NULL DEFAULT 0 CHECK (onboarding_step BETWEEN 0 AND 6)`.
  - Add `onboarding_completed_at timestamptz`.
- Trigger `profiles_onboarding_guard` (BEFORE UPDATE): when `onboarding_completed` flips false→true, require `full_name`, `preferred_language`, `region`, and at least one row in `emergency_contacts` for the user; stamp `onboarding_completed_at = now()`.
- Backfill existing rows with `full_name` + `region` set → `onboarding_completed = true`.

### A3. Migration: push subscription hardening
File: `supabase/migrations/<ts>_push_subscriptions_unique.sql`
- Add `UNIQUE (endpoint)` on `public.push_subscriptions` (drop dup rows first by keeping latest `updated_at`).
- Add `last_seen_at timestamptz NOT NULL DEFAULT now()` + index `(user_id, last_seen_at DESC)`.
- Add `failure_count int NOT NULL DEFAULT 0`.
- Function `prune_stale_push_subscriptions(_older_than interval default '30 days')` SECURITY DEFINER, service_role-only EXECUTE; deletes rows where `last_seen_at < now() - _older_than OR failure_count >= 5`.

### A4. Data seeding (post-migration approval)
Via `supabase--insert`:
- Refresh ~12 core protocols (CPR, choking adult/infant, bleeding, burns, fracture, shock, stroke FAST, seizure, snakebite, drowning, heat stroke, anaphylaxis) with bilingual `steps`, `red_flags_*`, `seek_help_*`, reference_books, video_url.
- Tanzanian region/facility corrections: ensure Dar es Salaam, Arusha, Mwanza, Dodoma, Mbeya, Zanzibar major hospitals present with phone + coordinates.

Exit: regenerated `types.ts` compiles, `ProtocolDetailModal` renders both formats, `useProtocols` returns new arrays.

---

## Work-stream B — Edge function CORS / origin rejection test suite

File: `supabase/functions/_shared/cors.e2e.test.ts` (new)
- Import `isOriginAllowed`, `rejectDisallowedOrigin`, `getCorsHeaders` from `_shared/cors.ts`.
- Unit assertions:
  - Allowed static origin → `getCorsHeaders` reflects `Access-Control-Allow-Origin`.
  - Disallowed origin → no `Allow-Origin` header, `Vary: Origin` present, base security headers (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`) present.
  - `rejectDisallowedOrigin` returns null for OPTIONS, null for allowed POST, 403 JSON for disallowed POST.
- Live HTTP test against each deployed function (loop): for `ai-chat, sms-gateway, ussd-handler, emergency-alert, sms-webhook, sms-retry, chw-location-update, send-push-notification, notify-case-update, security-events-export`:
  1. `OPTIONS` with `Origin: https://evil.example` → 200/204, security headers present, no `Allow-Origin` reflection.
  2. `POST` with `Origin: https://evil.example` → 403, JSON `{error:"Origin not allowed"}`, security headers present.
  3. `OPTIONS` with allowed origin → `Allow-Origin` reflected.
- Uses `Deno.test` + `std/dotenv` per project convention; consumes every response body.

---

## Work-stream C — Reports page rate limiting + streaming CSV export

### C1. Edge function: `reports-export` (new)
File: `supabase/functions/reports-export/index.ts`
- Admin-only: `getClaims()` → `is_admin` RPC check; 401/403 with structured JSON.
- Zod body: `{ since: isoDateTime, until?: isoDateTime, dataset: 'sms'|'security'|'cases'|'protocols' }`.
- Shared `enforceLimits({ scope:'reports-export', ipLimitPerMin: 5, userLimitPerMin: 10 })` returning standard 429 with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`.
- Streams CSV via `ReadableStream` + service-role `select` paged 1k rows, writes `Content-Type: text/csv`, `Content-Disposition: attachment; filename="report-<dataset>-<date>.csv"`, `Cache-Control: no-store`, security headers, CORS.
- Audit-log every export attempt (start + cancel + error) via `log_admin_action`.
- Config: add `[functions.reports-export]` block with `verify_jwt = false` (matches sibling pattern).

### C2. Frontend integration
- `src/pages/Reports.tsx`: replace per-dataset download buttons with `<CSVExportButton dataset="…" />` that reuses `streamCsvDownload` from `src/lib/streamingDownload.ts` (already supports 429 retry + countdown).
- `src/components/reports/CSVExportButton.tsx`: surface streaming progress (bytes, rows, retry countdown) via existing helper UI; cancel button aborts via `AbortController` and logs cancel action.
- Admin gate: hide button when `!profile.is_admin`.

### C3. Tests
File: `supabase/functions/reports-export/export.e2e.test.ts`
- Mirror the existing security-events-export test contract (401/403/400/200 stream/429 with headers).

---

## Work-stream D — Onboarding → case status → CHW push E2E test

### D1. Edge function test
File: `supabase/functions/notify-case-update/push.e2e.test.ts` (new)
- Requires env: `ADMIN_TEST_EMAIL/PASSWORD`, `CHW_TEST_EMAIL/PASSWORD`, `USER_TEST_EMAIL/PASSWORD` (test-only seed).
- Flow:
  1. Sign in as new user → call `/profiles` upsert with onboarding fields → assert `onboarding_completed=true` after trigger; insert one `emergency_contacts` row first.
  2. Sign in as CHW → register a fake push subscription via service-role insert into `push_subscriptions` (real Web Push not delivered; we assert dispatch).
  3. As user, POST `/functions/v1/emergency-alert` → assigns nearest CHW (seeded coords).
  4. As admin/service, update `emergency_cases.status='in_progress'` → triggers `notify-case-update`.
  5. Mock `send-push-notification` by intercepting via a wrapper env flag `PUSH_DRY_RUN=1` that returns the recipient list instead of calling Web Push.
  6. Assert response contains exactly the CHW's `user_id`; assert no non-CHW user_id present (permission gate).
- Negative test: same flow with a `user`-role subscription → asserts that subscription is filtered out.

### D2. Supporting helper
File: `supabase/functions/_shared/pushDispatch.ts` (extract list-recipients logic so it's testable; dry-run flag honored).

Exit: `supabase--test_edge_functions` green for all three new test files; types regen clean; admin reports export downloads bilingual CSV; CHW receives push on case status change.

---

## Execution order (after approval)

1. Run A1 → A2 → A3 migrations (sequential; await regen between each if needed).
2. Seed A4 data.
3. Implement B (cors tests) — pure additive, no risk.
4. Implement C1 + C3 edge function + tests, then C2 frontend.
5. Implement D1 + D2.
6. Run `supabase--linter` + `security--run_security_scan` + full Deno test suite; fix any regressions.
7. Update `mem://features/user-onboarding` (trigger guard), `mem://features/first-aid-protocols` (canonical steps shape), `mem://security/standards-hardening` (origin-rejection test coverage).

## Technical notes (non-user-facing)

- All new public-schema objects include explicit `GRANT` blocks per project rule.
- `SECURITY DEFINER` helpers default to `service_role`-only EXECUTE; widen only when an RLS policy or admin UI needs it.
- No edits to `supabase/config.toml` other than adding the new `[functions.reports-export]` block.
- Bilingual EN/SW enforced in seeded protocol content and all new UI strings.
