# Phase 6 — M-PESA Hardening, USSD Resilience, QA & SEO

## 1. M-PESA Configuration Checklist & Validation Screen

**New Edge Function** `mpesa-config-check` (verify_jwt=false, admin-only via JWT check in code):
- Reads env vars: `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_URL`, `MPESA_ENV`.
- Returns per-var `{ set: bool, valid: bool, hint }` — never leaks values (only length + last 4).
- Optional live probe: request a Daraja OAuth token (`/oauth/v1/generate?grant_type=client_credentials`) using key/secret; report `auth_ok`, `token_expires_in`.
- Validates: shortcode is 5-7 digits, callback URL is https, env ∈ {sandbox, production}, passkey length ≥ 40.

**New Admin Tab** `MpesaConfigTab.tsx` under Admin sidebar → "Payments":
- Bilingual (EN/SW) checklist card, one row per secret with ✓/✗ badge, hint, and "Recheck" button.
- "Test STK Push" section: input phone + KES 1, calls `mpesa-stk-push` in sandbox and shows raw response.
- Big status banner: "Demo mode" (any missing) vs "Live ready".
- Route wired via `AdminSidebar` + `Admin.tsx`.

**Frontend gating**: `src/pages/Support.tsx` calls `mpesa-config-check` on mount; if not ready, disables donation button and shows bilingual "Donations temporarily unavailable" notice instead of failing at STK time.

## 2. Automated Integration Tests

**Deno tests** (`supabase/functions/*/index.test.ts`) using dotenv skill for `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`:

- `mpesa-stk-push/index.test.ts`
  - `auth token generation`: mocks Daraja OAuth via `MPESA_ENV=sandbox` → asserts base64 header + 200.
  - `validation failures`: bad phone/amount → 400 with Zod errors.
  - `rate limit`: 6 rapid calls → 6th returns 429.
  - `production mode guard`: with `MPESA_ENV=production` and missing secrets → 503 with config error.
- `mpesa-callback/index.test.ts`
  - `success callback` (ResultCode=0): asserts `donations` row updates to `status='completed'`, receipt stored.
  - `failure callback` (ResultCode≠0): status='failed', failure_reason stored.
  - `unknown checkout_request_id`: returns 200 (Safaricom requires ack) but no DB write.
  - `malformed payload`: 400, no partial update.

Skill note: uses `import "https://deno.land/std@0.224.0/dotenv/load.ts"` and consumes every response body per edge-function-testing rules.

## 3. USSD Hardening — Donate + Nearest Clinic

In `supabase/functions/ussd-handler/index.ts`:
- Add Zod schemas for the two new branches; `text` split validated (only digits `*`-separated, max depth 6).
- **Donate branch (5)**: validate KES amount ∈ [10, 70000]; validate phone regex `^2547\d{8}$`; on invalid → `END Invalid amount / Kiasi si sahihi`.
- **Nearest Clinic branch**: validate county code against enum; empty results → friendly `END No clinic found nearby`.
- Wrap downstream `mpesa-stk-push` invoke + Supabase queries in try/catch:
  - Non-2xx from STK → `END Service busy, please retry (Huduma ina shughuli)`.
  - 429 → same message + logged as `ussd_rate_limited`.
  - 5xx → `END Temporary error, try later`.
- **Denial logging**: every rejected request (validation, 429, 5xx) inserts into `security_events` (`event_type='ussd_denied'`, scope=`donate|clinic`, details incl. reason, session id, msisdn hash — never raw phone).
- Add unit-style test file `ussd-handler/index.test.ts` covering each denial path.

## 4. Smoke Test — /support + CHW Analytics Admin

Playwright script under `/tmp/browser/phase6/`:
- Auth via injected Supabase session.
- **/support**: visit → screenshot; click each donation preset (100/500/1000/custom); assert loading spinner on submit; assert disabled state in demo mode; check console + network for 4xx/5xx; language toggle EN↔SW.
- **/admin → CHW Analytics**: visit → screenshot; verify charts render (non-empty SVG); click **Export CSV** → assert download triggered + CSV parses with expected headers; date-range filter round-trip; empty-state render when no cases.

Fix anything the sweep surfaces: missing loading states, broken CSV MIME, unbound onClick, missing empty states, unhandled promise rejections.

## 5. SEO for /support (EN + SW)

- Install `react-helmet-async` (if not already) and wrap root in `HelmetProvider`.
- `Support.tsx` renders `<Helmet>` with:
  - `<title>` — locale-aware ("Support MediReach+ — Donate via M-PESA" / "Saidia MediReach+ — Changia kupitia M-PESA").
  - `<meta name="description">` per locale (<160 chars).
  - `<link rel="canonical" href="https://fortify-trust-wall.lovable.app/support">`.
  - OpenGraph: `og:title`, `og:description`, `og:type=website`, `og:url`, `og:locale` = `en_KE` / `sw_KE`, plus `og:locale:alternate`.
  - Twitter card: `summary_large_image`.
  - `<link rel="alternate" hreflang="en">` + `hreflang="sw"` + `x-default` (query param `?lang=`).
  - JSON-LD `DonateAction` on `NGOHealthOrganization` (name, url, sameAs, potentialAction).
- Update `scripts/generate-sitemap.ts` `entries` to include `/support` with `changefreq: monthly`, `priority: 0.8`.
- Verify via `seo_chat--trigger_scan` after deploy and mark findings fixed.

## Technical Details

- Secrets referenced only server-side; `mpesa-config-check` returns booleans, never values.
- All new tables/columns: none required (reuse `donations`, `security_events`, `ussd_sessions`).
- All new Edge Functions get CORS via `npm:@supabase/supabase-js@2/cors`.
- Rate limits use existing `consume_rate_limit` RPC (`mpesa_stk:{uid|ip}` cap 5/min).
- No design changes; reuse existing tokens and shadcn components.

## Verification Checklist

- Admin → Payments tab shows 6 green checks with valid secrets, red X with hints otherwise.
- `deno test` green for both mpesa functions.
- USSD simulator: invalid amount, 429, and 5xx paths each return proper `END …` message and log a `security_events` row.
- Playwright smoke: 0 console errors on /support and /admin CHW Analytics; CSV downloads and parses.
- `curl -I` on /support shows correct title/description; social debugger renders JSON-LD; sitemap.xml contains /support.

## Out of Scope

- No new payment providers (Stripe/Paddle).
- No schema migrations (donations table already covers this).
- No visual redesign of /support or Admin.
