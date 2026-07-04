## Phase 7 — USSD Hardening, M-PESA Tests, Smoke Pass, SEO Verification

### 1. USSD Hardening (`supabase/functions/ussd-handler/index.ts`)
- Add Zod schemas for the two new branches:
  - **Donate M-PESA**: amount int 10–70000, sanitized digits only.
  - **Nearest Clinic** (option 2): validate any sub-input; reject non-numeric with bilingual `END` message.
- Wrap Supabase/DB calls and any outbound fetches in try/catch. On failure return `END Service temporarily unavailable / Huduma haipatikani kwa muda.` (5xx path).
- On rate-limit denial (existing `enforceLimits`) and on validation failure, call `logSecurityEvent` from `_shared/securityLog.ts` with:
  - `event_type: 'rate_limit_429'` or `'validation_failed'`
  - `scope: 'ussd-donate' | 'ussd-clinic'`
  - `ip_address: phoneNumber` (proxy), `details: { menu_path, input_len }` — never raw PII.
- Add `menu_path` update on each turn (column already exists).

### 2. M-PESA Deno Tests
Create `supabase/functions/mpesa-stk-push/index.test.ts`:
- Stub `fetch` to mock Daraja OAuth (`/oauth/v1/generate`) returning access_token in sandbox and production URLs.
- Cases: missing secrets → 503; invalid Zod body → 400; unauthorized → 401; rate limit → 429; happy path sandbox → 200 with `checkout_request_id` and DB insert asserted via service client; production mode uses `api.safaricom.co.ke` (assert URL).
- Load env via `dotenv/load.ts` per edge-function-testing rules; always consume response bodies.

Create `supabase/functions/mpesa-callback/index.test.ts`:
- Seed a `donations` row with `checkout_request_id`.
- POST callback `ResultCode=0` with MpesaReceiptNumber → row `status='success'`, receipt saved.
- `ResultCode=1032` → `status='cancelled'`. Other codes → `status='failed'`.
- Malformed body → still `ResultCode:0` ack (Safaricom contract).

### 3. Smoke Test Pass (Playwright via shell in build mode)
- `/support` (unauth + auth, EN + SW):
  - Page renders, language toggle switches copy, preset amount buttons update input, "Donate" disabled in demo mode with bilingual notice, JSON-LD `<script type="application/ld+json">` present with `DonateAction`.
- `/admin` → CHW Analytics tab (as admin):
  - Charts render (KPI cards, Recharts SVG present), CSV export button downloads a non-empty file (assert `Content-Disposition` + row count > 0 or empty-state message), date filters round-trip.
- Fix any dead buttons/loading-state bugs discovered (report and patch in-place).

### 4. `/support` SEO Verification
Audit `src/pages/Support.tsx` + `public/sitemap.xml`:
- Confirm both EN & SW `<Helmet>` blocks emit: `<title>`, description, canonical, `og:title/description/url/type`, `twitter:card`, `alternate` hreflang (`en`, `sw`, `x-default`).
- Confirm JSON-LD `DonateAction` on `NGOHealthOrganization` validates (structure check).
- Confirm `public/sitemap.xml` `/support` entry includes hreflang xhtml:link alternates (already present) and matches canonical URLs in Helmet.
- Fix any mismatches (URL casing, missing `og:image` policy per head-metadata rules — leave off if no absolute URL).

### Verification
- `deno test` green for both m-pesa functions.
- Playwright smoke: 0 console errors, screenshots saved under `/tmp/browser/`.
- USSD denial paths produce rows in `security_events` (verified via `supabase--read_query`).
- View-source of `/support?lang=en` and `?lang=sw` shows correct localized head tags.

### Out of Scope
- No new payment providers, no schema migrations, no visual redesign.
- No changes to existing passing edge functions beyond USSD.
