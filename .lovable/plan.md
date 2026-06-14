## Goal
Make the running app match the uploaded final-year report: **MediReach+, Kenya-focused, AI + blockchain-secured mHealth PWA**. The existing code is already geographically neutral (no hard-coded "Tanzania" strings) and already implements every other feature the report describes (PWA, AI chat EN/SW, CHW dashboard, admin panel, USSD/SMS, Leaflet map, RBAC, Supabase backend, security gate). Two real gaps remain:

1. Project narrative + memory says Tanzania → must say **Kenya**.
2. Report claims a **blockchain-secured data-integrity module** that does not yet exist.

Everything else in the report (Kenya Data Protection Act compliance posture, M-PESA mention, Swahili, CHWs, golden-hour emergency flow) is already supported by existing features and only needs copy/seed-data alignment.

## Scope of changes

### 1. Geography realignment (Tanzania → Kenya)
- Update `mem://index.md` core rule and `mem://project/geographic-focus` to Kenyan regions (Nairobi, Mombasa, Kisumu, Nakuru, Eldoret, Nyeri, Kakamega, Machakos, Kiambu, Garissa).
- Sweep these surfaces and switch any Tanzania copy / phone prefixes / currency to Kenya equivalents (`+254`, `KES`, "Kenya", "Ministry of Health Kenya"):
  - `index.html` (SEO meta, JSON-LD `areaServed`, OG description)
  - `public/sitemap.xml` / `robots.txt` copy where applicable
  - `README.md`, `security/README.md`
  - `src/lib/translations.ts` (any country/region strings)
  - Onboarding location step (`OnboardingLocation.tsx`) default region list
  - Quick-dial / emergency numbers (`QuickDialButtons.tsx`) — switch to Kenya: 999 / 112 / 911, St John 0721 225 285, Red Cross 1199.
  - Any seed data inserted via Supabase migrations for `health_facilities` — add a follow-up migration that inserts a small Kenyan facility seed set (idempotent `ON CONFLICT DO NOTHING`).
- Update `findingMap.mjs` only if affected SQL migration paths move.

### 2. Blockchain-secured audit-integrity module
Implement a lightweight, app-internal **hash-chain over `audit_logs`** (the report's "blockchain-secured data integrity"). No external chain, no tokens — just tamper-evidence backed by Postgres + Edge Function verification.

- **Migration** (`supabase/migrations/<ts>_audit_hash_chain.sql`):
  - Add `prev_hash TEXT`, `entry_hash TEXT`, `chain_index BIGSERIAL` to `public.audit_logs`.
  - Trigger `audit_logs_chain_bi` (BEFORE INSERT) computes `entry_hash = encode(digest(prev_hash || row_canonical_json, 'sha256'), 'hex')` using the latest existing row's `entry_hash` as `prev_hash`. Genesis row uses 64×`0`.
  - Function `public.verify_audit_chain(_from bigint default 0, _to bigint default null)` returns `(ok boolean, broken_at bigint)`. `SECURITY DEFINER`, `SET search_path=public`, EXECUTE granted to no one, called via admin RPC.
  - Admin-gated RPC `public.admin_verify_audit_chain()` that checks `is_admin(auth.uid())` then returns `verify_audit_chain()`. Add appropriate GRANT to `authenticated`.
  - Indexes: `audit_logs (chain_index)`, unique on `entry_hash`.
- **Edge Function** `supabase/functions/audit-chain-verify/index.ts` — admin-only wrapper that calls the RPC, logs to `security_events`, supports range params, returns JSON `{ok, broken_at, verified_at}`. Reuses `_shared/cors.ts`, `rateLimit.ts`, `validation.ts`. `verify_jwt = false` per project convention; admin check inside.
- **Admin UI** new tab `BlockchainIntegrityTab.tsx` under `src/components/admin/`, added to `AdminSidebar`. Shows: latest `chain_index`, last verification timestamp/result, "Verify now" button calling the Edge Function, recent verification history (from `security_events` filtered by `event_type='audit_chain_verify'`).
- **Tests**:
  - `supabase/functions/audit-chain-verify/*.e2e.test.ts` — happy path + non-admin 403 + tampered-row detection (insert raw via `service_role`, mutate row, expect `ok=false`).
  - Vitest unit for the React tab (mock the function).
- **Docs**: append "Audit Chain Integrity" section to `security/README.md` describing the design and the verify command (`npm run security:verify-chain` → curls the Edge Function locally for dev).

### 3. Security-finding mapping refresh
- Add the new functions (`verify_audit_chain`, `admin_verify_audit_chain`) to `FIX_MAP.SUPA_authenticated_security_definer_function_executable.affected` in `scripts/lib/findingMap.mjs` and regenerate `security/REMEDIATION.md` via `npm run security:render`. Re-run `node scripts/security-verify-links.mjs` and `node --test scripts/__tests__/security-links.test.mjs` to confirm link integrity stays green.

### 4. SEO + copy alignment (already mostly there)
- Update `<title>`, meta description, OG/Twitter and the `MedicalWebPage` JSON-LD `areaServed` in `index.html` to "Kenya".
- Update `public/sitemap.xml` `<lastmod>` and any country tags if present.

### 5. Out of scope
- No external blockchain/smart-contract integration (the report's "blockchain-secured" claim is interpreted as tamper-evident hash chain, which is the standard academic interpretation and avoids paid infra).
- No new external services or secrets.
- No changes to onboarding flow length (still 6 steps), AI provider, or auth providers.

## Verification checklist
- `npm run security:render && node scripts/security-verify-links.mjs && node --test scripts/__tests__/security-links.test.mjs` — all green.
- New migration applied; `select public.admin_verify_audit_chain()` returns `(true, null)` for a fresh chain; tampering a row flips to `(false, <idx>)`.
- Admin panel "Audit Chain Integrity" tab renders, verify button hits the Edge Function, result toasts in English + Swahili.
- Preview at `/` shows Kenya copy in hero/SEO; quick-dial shows Kenyan emergency numbers; onboarding region list shows Kenyan regions.

## Memory updates after build
- Rewrite `mem://project/geographic-focus` to Kenyan regions.
- Replace core rule "MediReach+ ... for Tanzania" with "...for Kenya".
- Add `mem://features/audit-chain-integrity` describing the hash-chain design, trigger, RPC, and admin tab.
