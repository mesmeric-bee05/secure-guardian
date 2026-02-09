

# Comprehensive Plan: Testing, Protocol Enhancements, Dashboard Link, and Security Hardening

This plan addresses four areas: end-to-end verification with fixes, protocol-specific content updates, dashboard navigation improvements, and security hardening based on the uploaded security thesis document.

---

## Phase 1: End-to-End Verification and Bug Fixes

### 1A. First Aid Protocol Modal -- Video and Books (Verified Working)
The `ProtocolDetailModal.tsx` already has YouTube embed support (`getYouTubeEmbedUrl`) and reference book sections. Database confirms all protocols have `video_url` and `reference_books` populated. However, all protocols currently share the same two generic books. This is addressed in Phase 2.

### 1B. Reports Page (Verified Working)
`/reports` route exists and is protected with `requiredRoles={['chw', 'admin']}`. The page fetches from `emergency_cases` and renders 5 chart/table sections. No code errors detected.

### 1C. Chat Markdown Rendering (Verified Working)
`ChatMessageList.tsx` uses `ReactMarkdown` with `prose prose-sm` classes for assistant messages. User messages remain plain text.

---

## Phase 2: Protocol-Specific Reference Books and Videos

Currently every protocol has the same two books ("Where There Is No Doctor" and "First Aid Manual") and videos are partially relevant (e.g., burns and choking share the same video). This phase seeds category-specific content.

### Database Update (SQL)
Update each protocol category with tailored video URLs and reference books:

| Category | Video Topic | Additional Books |
|----------|------------|------------------|
| cardiac / heart_attack | CPR and AED usage (British Heart Foundation) | "CPR, AED and First Aid Provider Handbook" by Karl Disque |
| burns | Burns treatment (St John Ambulance) | "Emergency Care for Burns" by Springer |
| bleeding / trauma | Wound care and bleeding control (Stop the Bleed) | "Tactical Medicine Essentials" by NAEMT |
| choking / breathing | Heimlich maneuver (Red Cross) | "Pediatric First Aid for Caregivers" by AAP |
| fractures | Fracture immobilization (St John Ambulance) | "Emergency Orthopedics" by Springer |

Each protocol will retain "Where There Is No Doctor" as a universal reference, plus gain 1-2 category-specific books.

---

## Phase 3: Dashboard Link to Reports Page

### Modified File: `src/pages/Dashboard.tsx`
Add a "View Reports" button/link in the Dashboard header or analytics tab that navigates CHWs to `/reports`.

### Modified File: `src/components/dashboard/DashboardHeader.tsx`
Add a `BarChart3` icon button in the header toolbar that links to `/reports`.

---

## Phase 4: Security Hardening (Based on Uploaded Thesis)

The thesis identifies 10 security vulnerability categories. Here is the assessment and required fixes for this project:

### Already Implemented (No Changes Needed)
1. **Server-side authorization** -- Edge functions validate JWT tokens and check roles (`is_admin`, `is_chw`) server-side before executing actions.
2. **Input validation** -- Zod schemas on the frontend (`validations.ts`) and manual validation in every edge function.
3. **Rate limiting** -- All edge functions implement in-memory rate limiting.
4. **Webhook verification** -- `sms-webhook` validates delivery report structure and checks for replay attacks.
5. **RLS policies** -- All tables have RLS enabled with anonymous denial policies.
6. **Error handling** -- Edge functions log errors server-side and return generic messages to users.
7. **Sensitive data logging** -- Console logs use truncated user IDs and avoid PII.

### Fixes Required

#### Fix 1: CORS Hardening on Edge Functions (High Priority)
**Problem (from thesis):** All edge functions use `'Access-Control-Allow-Origin': '*'`, allowing any domain to call APIs.
**Fix:** Restrict CORS to the project's actual domains.

**Files to modify:**
- `supabase/functions/ai-chat/index.ts`
- `supabase/functions/emergency-alert/index.ts`
- `supabase/functions/sms-gateway/index.ts`
- `supabase/functions/sms-webhook/index.ts` (keep permissive for webhook callbacks)
- `supabase/functions/sms-retry/index.ts`
- `supabase/functions/chw-location-update/index.ts`
- `supabase/functions/send-push-notification/index.ts`
- `supabase/functions/ussd-handler/index.ts` (keep permissive for USSD provider)

Create a shared CORS helper that allows only known origins:
```text
const ALLOWED_ORIGINS = [
  'https://id-preview--a195f4d5-59f8-49b0-9a16-0b1c51758426.lovable.app',
  'https://a195f4d5-59f8-49b0-9a16-0b1c51758426.lovableproject.com',
];
```

#### Fix 2: Password Strength Enhancement (Medium Priority)
**Problem:** Signup schema requires uppercase, lowercase, and number but no special character requirement.
**Fix:** Add special character requirement to `signupSchema` in `src/lib/validations.ts`:
```text
.regex(/[!@#$%^&*(),.?":{}|<>]/, { message: 'Password must contain at least one special character' })
```

#### Fix 3: Redirect URL Validation (Medium Priority)
**Problem (from thesis):** The `Auth.tsx` page uses `state.from` for post-login redirect without validating it.
**Fix:** Add an allowlist check in `Auth.tsx` before navigating to redirect paths. Only allow relative paths starting with `/` and matching known routes.

#### Fix 4: Push Notification Function Auth (Medium Priority)
**Problem:** `send-push-notification/index.ts` has NO authentication check. Any caller can send push notifications if they know a user_id.
**Fix:** Add service-role key validation or JWT check to ensure only internal calls (from `emergency-alert`) can invoke it.

#### Fix 5: Verbose Error Messages in Catch Blocks (Low Priority)
**Problem:** Some edge functions return `error.message` directly to the client in 500 responses, potentially leaking internal details.
**Fix:** Replace with generic "An error occurred" messages in production responses while keeping server-side logging.

#### Fix 6: Session/JWT Configuration Note (Informational)
**Problem (from thesis):** Permanent sessions risk. Supabase defaults to 1-hour JWTs with refresh tokens, which is already reasonable. No code change needed but noted for awareness.

#### Fix 7: Leaked Password Protection (Linter Warning)
**Problem:** The database linter flagged that leaked password protection (HIBP check) is disabled.
**Fix:** This must be enabled manually in the backend settings. Will note for the user.

---

## Implementation Order

1. **Dashboard Reports link** -- Add BarChart3 button to DashboardHeader linking to `/reports`
2. **Protocol-specific content** -- SQL update with tailored videos and books per category
3. **CORS hardening** -- Update all edge functions with domain-restricted CORS
4. **Push notification auth** -- Add service-role validation to send-push-notification
5. **Password special character** -- Update signupSchema
6. **Redirect validation** -- Add allowlist check in Auth.tsx
7. **Generic error messages** -- Sanitize 500 responses across edge functions
8. **Deploy and test** -- Deploy all edge functions and verify

---

## Files Summary

### Modified Files (12)
- `src/pages/Dashboard.tsx` -- Add Reports navigation link
- `src/components/dashboard/DashboardHeader.tsx` -- Add Reports icon button
- `src/lib/validations.ts` -- Add special character password requirement
- `src/pages/Auth.tsx` -- Add redirect URL validation
- `supabase/functions/ai-chat/index.ts` -- CORS hardening + generic errors
- `supabase/functions/emergency-alert/index.ts` -- CORS hardening + generic errors
- `supabase/functions/sms-gateway/index.ts` -- CORS hardening + generic errors
- `supabase/functions/sms-retry/index.ts` -- CORS hardening + generic errors
- `supabase/functions/chw-location-update/index.ts` -- CORS hardening + generic errors
- `supabase/functions/send-push-notification/index.ts` -- Auth check + CORS hardening
- `supabase/functions/sms-webhook/index.ts` -- Generic error cleanup (keep open CORS for webhooks)
- `supabase/functions/ussd-handler/index.ts` -- Generic error cleanup (keep open CORS for USSD)

### Database Changes (1)
- UPDATE `first_aid_protocols` with category-specific video URLs and reference books

### No New Files Required

### Manual Action Required
- Enable leaked password protection (HIBP) in the backend settings (Cloud View)

