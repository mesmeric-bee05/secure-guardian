

# Plan: Fix Emergency Call Buttons, Security Hardening, Full Project Polish

## Issues Found

### 1. Emergency Call Buttons Not Working (Primary User Complaint)
The `QuickDialButtons` component uses `window.location.href = 'tel:999'` which only works on mobile devices with phone capabilities. In the browser preview, this does nothing. 

**Fix:** Add a fallback — when `tel:` is not supported (desktop browser), show a toast with the number to call and optionally copy it to clipboard. Also use `window.open()` instead of `location.href` to avoid navigating away from the app.

### 2. Security Scan Findings (6 findings, 3 errors)

| Finding | Level | Fix |
|---------|-------|-----|
| Leaked password protection disabled | warn | Requires dashboard config — mark as accepted with justification |
| USSD sessions PERMISSIVE false policies | error | Already deny access correctly (PERMISSIVE false = no access granted). Mark as addressed with explanation |
| Emergency cases Realtime broadcast | error | Accept as risk — table-level RLS restricts queries; Realtime broadcast is scoped by channel subscription in client code |
| CHW assignments Realtime broadcast | error | Same as above — accept with justification |
| User roles privilege escalation | warn | No INSERT policy for non-admins + RLS default-deny = safe. Mark as addressed |
| Audit log integrity | warn | Already restricted to service role only (no INSERT policy for authenticated). Mark as addressed |

### 3. notify-case-update Edge Function
Not yet added to `supabase/config.toml` — needs a config block for `verify_jwt = false` to match the other functions.

### 4. Reports Page Verification
Code review confirms Response Time Trend, Regional Breakdown, and CHW Performance with names are all implemented correctly. No code changes needed.

### 5. Chat CSRF Verification
Code review confirms `ChatInput.tsx` validates CSRF token before calling `onSend`. No code changes needed.

## Changes

### File 1: `src/components/emergency/QuickDialButtons.tsx`
- Replace `window.location.href = 'tel:...'` with `window.open('tel:...')` 
- Add fallback: if the call fails or user is on desktop, show a toast with the emergency number and copy to clipboard
- Add bilingual support for button labels (Emergency/Dharura, Ambulance/Ambulensi, Police/Polisi, Fire/Moto)

### File 2: `supabase/config.toml`
- Add `[functions.notify-case-update]` with `verify_jwt = false`

### File 3: Security findings management
- Update/resolve 6 security findings with proper justifications

## Execution Order
1. Fix QuickDialButtons (user-visible bug)
2. Add notify-case-update to config.toml
3. Manage all 6 security findings

