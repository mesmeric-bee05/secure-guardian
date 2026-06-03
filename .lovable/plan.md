
# MediReach+ Phased Delivery Roadmap

A high-level plan covering the full request batch. We will pick **one phase at a time** and produce a detailed implementation plan for it before any code changes. Each phase lists scope, key files/tables, and the exit criteria that mean "done".

---

## Phase 0 — Baseline audit (no feature work)

Goal: know exactly where we stand before adding more surface area.

- Run `supabase--linter` and `security--run_security_scan`.
- Read latest console/network/runtime errors from preview.
- Sweep edge functions for CORS, JWT verification, Zod validation gaps.
- Inventory existing migrations vs. tables actually referenced in code.

Exit: a short findings list grouped by severity that feeds the later phases.

---

## Phase 1 — Security & hardening foundation

- Tighten CORS allowlist in `supabase/functions/_shared/cors.ts` (env-driven, no wildcard fallback).
- Enforce `getClaims()` auth + Zod validation on every non-public edge function (`ai-chat`, `sms-gateway`, `ussd-handler`, `emergency-alert`, `chw-location-update`, `send-push-notification`, `notify-case-update`, `sms-retry`, `sms-webhook`).
- Enable HIBP password protection (`configure_auth`).
- Standardize structured error responses (no stack traces, no PII).
- Verify all `SECURITY DEFINER` functions have `search_path` and revoked public EXECUTE.
- Re-run linter; resolve remaining warnings or document exceptions in `mem://security/standards-hardening`.

Exit: scanner clean (or each finding triaged), all edge functions validated + authed where required.

---

## Phase 2 — Database & content migrations

- Migration: protocol schema updates (red flags, seek-help arrays, reference books JSON shape, bilingual steps normalization).
- Migration: onboarding completion enforcement (`profiles.onboarding_completed` default + trigger checks).
- Migration: push subscription uniqueness + cleanup of stale endpoints.
- Data inserts (via `supabase--insert`): refreshed protocol content EN/SW, Tanzanian region/facility seed corrections.

Exit: types regenerate cleanly; protocol library renders updated content in both languages.

---

## Phase 3 — Onboarding flow + routing guardrails

- 6-step onboarding (Welcome → Profile → Medical → Location → Contacts → Notifications) — components already scaffolded; wire mandatory gate.
- `ProtectedRoute` redirects to `/onboarding` when `profile.onboarding_completed === false`.
- Persist progress between steps; resume on reload.
- Update `App.tsx` routes + nav links accordingly.

Exit: new account cannot reach `/chat`, `/emergency`, `/dashboard` until onboarding is complete.

---

## Phase 4 — Offline-first PWA correctness

- Audit `useServiceWorker`, `useOfflineData`, `offlineStorage`, `useBackgroundSync`.
- Ensure SW registration is guarded (no register in Lovable preview/iframe).
- Verify IndexedDB caches: protocols, facilities, queued emergency reports.
- Background sync priority queue: emergencies > case updates > telemetry.
- Toasts in EN/SW for offline-ready / update-available.

Exit: airplane-mode test loads cached protocols + facilities and queues an emergency that flushes on reconnect.

---

## Phase 5 — Chat + Protocol UX polish

- Markdown rendering hardening in `ChatMessageList` (sanitized, code blocks, lists, links open in new tab).
- Red-flag symptom detector surfaces an inline alert card.
- `ProtocolDetailModal`: fix steps data-format bug (handles both `{en:[], sw:[]}` and `[{step_en, step_sw}]`), add video resource + reference books section, bilingual toggle.

Exit: chat renders rich markdown safely; every seeded protocol opens without console errors.

---

## Phase 6 — SMS / USSD / CHW operations

- `sms-webhook`: persist delivery status, signature verification.
- `sms-retry`: bulk retry UI in admin (status filter, dry-run count, batched execution with rate limiter).
- Location-based CHW assignment: use `find_nearest_chw` RPC inside `emergency-alert`; record assignment + notify nearest CHW.
- Real-time CHW location tracking already in `useRealtimeCHWLocations` — add staleness badge + map heatbeat.

Exit: simulated emergency assigns nearest active CHW; failed SMS can be bulk-retried from admin.

---

## Phase 7 — Push notifications end-to-end

- Verify VAPID keys present (already in secrets).
- `usePushSubscription` saves endpoint with auth+p256dh keys.
- `send-push-notification` uses service role + validates payload; `notify-case-update` triggers on case status change.
- Admin can broadcast to CHWs in a region.

Exit: CHW receives push within seconds of emergency assignment in their region.

---

## Phase 8 — Reports page + analytics

- `/reports` page (CHW + admin) with date range filter, CSV export button (reusing the streaming export pattern from Security Events).
- Recharts: case trends, response times, status overview, priority distribution (components already scaffolded).
- Embeddable mode (`?embed=1`) hides chrome for iframe usage.

Exit: report loads under 2s with seeded data; CSV downloads with active filters applied.

---

## Phase 9 — SEO + accessibility pass

- Per-route `<title>` + meta description, single H1, JSON-LD for organization.
- `robots.txt`, canonical tags, OG/Twitter cards.
- Color contrast audit against medical theme tokens; large touch targets verified at 945px viewport.

Exit: Lighthouse SEO ≥ 95, a11y ≥ 95 on Index, Emergency, Chat.

---

## Phase 10 — User-flow QA + regression tests

- Edge-function Deno tests for each hardened endpoint (auth, validation, rate limit, happy path).
- Manual scripted flow: signup → onboarding → chat → emergency → CHW assignment → push → report export.
- Final linter + security scan + console error sweep.

Exit: all tests green, scanner clean, no console errors on primary flows.

---

## How we'll proceed

Reply with the phase number to start (recommended order: **0 → 1 → 2 → …**). I'll then produce a detailed, file-level implementation plan for just that phase and, on approval, execute it.

### Technical notes
- All DB structure via `supabase--migration`; data seeding via `supabase--insert`.
- Edge function changes deploy automatically; do not edit `supabase/config.toml` project-level settings.
- Memory files under `mem://` will be updated when a phase introduces durable rules (e.g. CORS allowlist policy, onboarding gate).
- Bilingual EN/SW is a hard requirement for every user-facing string added in any phase.
