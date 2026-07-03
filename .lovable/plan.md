## Goal
Close the remaining gaps between the MediReach+ report and the running app, fix the broken items you flagged, and do a focused hardening pass — without churning parts of the app that already work.

The three big features to add (from your selection): **M-PESA donation/support flow**, **richer USSD menu tree**, **CHW case analytics dashboard**. Plus a targeted bug + security sweep.

---

## 1. Fix broken protocol videos (bug sweep — quick win)

Symptom: some First-Aid Protocols show a broken/blank video area.

Root cause: `ProtocolVideoResource` only renders a YouTube thumbnail + "open in new tab" fallback (no inline player), and several `video_url` values in `first_aid_protocols` are duplicates / occasionally geo-blocked or removed. Component fails silently when thumbnail 404s.

Fixes:
- Replace the thumbnail-only view with an actual embedded YouTube `<iframe>` (privacy-enhanced `youtube-nocookie.com/embed/...`) with lazy loading and a graceful fallback card when the URL isn't a YouTube URL or when the iframe fails to load (`onError` → fallback).
- Add a small `onError` handler on the thumbnail image so a missing thumbnail no longer leaves an empty box.
- Data pass: re-check all `first_aid_protocols.video_url` rows; replace confirmed-dead/duplicated URLs with vetted Red Cross / St John Ambulance Kenya-relevant videos (curated list, EN + SW captions where available).
- Add bilingual "Video unavailable — open training guide" copy.

## 2. M-PESA donation / support flow (report-gap feature)

Report explicitly frames MediReach+ around the Kenyan M-PESA ecosystem. Add a lightweight **donation / community-support** flow (not a paywall — the app stays free for emergencies).

- New page `/support` with a bilingual donation card: preset amounts (KES 100 / 500 / 1,000 / custom), phone number entry (defaults from profile), "Donate via M-PESA" button.
- Edge function `mpesa-stk-push` (verify_jwt=false, auth-check inline) that:
  - Validates input (Zod: phone `2547XXXXXXXX`, amount 10–70,000).
  - Uses **Safaricom Daraja sandbox** by default. Reads `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_URL`, `MPESA_ENV` (`sandbox`|`production`) via `add_secret`. If secrets are missing the endpoint returns a friendly "M-PESA not configured yet — contact admin" message so the UI still works in demo mode.
  - Gets OAuth token → issues STK Push → returns `CheckoutRequestID`.
  - Rate-limited (5/min per IP) via existing `enforceLimits`.
- Edge function `mpesa-callback` (verify_jwt=false, public) that receives Safaricom's async result and writes to a new `donations` table.
- New table `public.donations` (amount, phone_msisdn hashed, status, checkout_request_id, receipt, user_id nullable, created_at, updated_at) with RLS: users see own donations; admins see all; service_role full. GRANTs per project rules.
- Admin: small "Donations" card in existing `AnalyticsDashboardTab` (total raised, last 30 days chart) — no new admin tab.
- Copy: bilingual EN/SW throughout, disclaimer that donations support platform operations, not medical services.

## 3. Richer USSD menu tree (report-gap feature)

Current `ussd-handler` is minimal. Expand to the full flow the report describes so offline users have a real path.

Menu structure (rendered in EN or SW based on session language choice at step 1):

```
CON Karibu MediReach+ / Welcome
1. English
2. Kiswahili
  → 1. Emergency (SOS)              → trigger emergency_alert flow, ask location county
    → 2. First Aid Guide             → list top 6 protocols, then step-by-step summary
    → 3. Find Nearest Clinic         → county → returns 3 closest facilities
    → 4. Ask Health Question         → prompts short text, calls ai-chat (offline-safe summary)
    → 5. Register / Update Profile   → name + county + one emergency contact
    → 6. Donate via M-PESA           → prompts amount, triggers STK push
    → 0. Exit
```

- Persist state across USSD hops in existing `ussd_sessions` (add `menu_path text` column).
- All responses ≤ 182 chars per Africa's Talking limit; long protocol content paginated with "0. Back / 00. More".
- E2E tests for each branch under `supabase/functions/ussd-handler/*.e2e.test.ts`.

## 4. CHW case analytics dashboard (report-gap feature)

Extend the existing `CHWManagementTab` (or add a sub-tab within it) with case analytics for CHW-owned cases:

- KPI cards: assigned cases, resolved this week, avg response time, active CHWs.
- Charts (Recharts, reuse existing `CaseTrendsChart`, `ResponseTimeChart`, `StatusOverviewChart` where possible):
  - Cases per CHW (bar).
  - Cases by county heat table.
  - Response-time distribution.
- CSV export of CHW-owned cases (reuse `CSVExportButton` pattern; server-side via `reports-export` edge function with a new `scope=chw_cases` param).
- Date-range filter (reuse `DateRangeFilter`).

Data comes from existing `emergency_cases` + `chw_assignments` tables — no schema change beyond an index on `emergency_cases(assigned_chw_id, created_at)` if the query planner needs it.

## 5. Bug + button sweep

Walk every route (`/`, `/emergency`, `/chat`, `/dashboard`, `/onboarding/*`, `/profile`, `/reports`, `/admin`, `/auth`) via Playwright, take screenshots, and enumerate:

- Buttons with no `onClick`, no route, or navigating to a stale path.
- Any console errors in normal flows (I'll capture and log; fix each root-cause, not the surface).
- Bilingual gaps: any hard-coded English strings that bypass `translations.ts`.

Only genuine defects get fixed — no cosmetic rewrites.

## 6. Security hardening (targeted, minimal)

- Add `verify_jwt = false` config entries in `supabase/config.toml` for the two new functions (project convention — auth-checked in code).
- Run `supabase--linter` after migration; fix anything new.
- Ensure `donations` RLS is airtight (users cannot see others' phone/receipt).
- Re-run `npm run security:render && npm run security:verify-links` and update `findingMap.mjs` for the new SECURITY DEFINER helpers (if any).

## 7. Out of scope
- No Stripe/Paddle. M-PESA only (per report).
- No web3/on-chain blockchain — the SHA-256 audit hash chain already ships.
- No redesign, no new fonts/colors, no onboarding step count change.
- No changes to auth providers.

---

## Verification checklist
- Every protocol card in `/` opens the modal and shows either a playing embed or a clean fallback.
- STK push against sandbox returns `ResponseCode=0`; callback writes a `donations` row; `/support` shows success toast in EN + SW.
- USSD simulator (Africa's Talking) walks all 6 branches without dead-ends; SMS-quality responses.
- CHW analytics tab renders charts + CSV downloads a non-empty file when data exists.
- Playwright sweep: 0 console errors, 0 dead buttons on the tracked routes.
- `npm run security:render && node scripts/security-verify-links.mjs && node --test scripts/__tests__/security-links.test.mjs` all green.
- `supabase--linter` clean.

## Technical notes
- **Secrets I'll request via `add_secret`**: `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_URL`, `MPESA_ENV`. If you skip them, `/support` renders in "demo mode" and the button explains M-PESA isn't wired yet — nothing breaks.
- **New tables**: `donations` only. All other work reuses existing tables.
- **New edge functions**: `mpesa-stk-push`, `mpesa-callback`. Existing `ussd-handler`, `reports-export`, `ai-chat` get extended, not replaced.
- **New UI**: `/support` page + `src/components/support/DonationCard.tsx`; CHW analytics extends existing tab; no new admin tab.
