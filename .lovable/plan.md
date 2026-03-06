

# Plan: Fix CHW Dashboard Navigation, RLS Policies (Again), and Platform-Wide CSRF

## Root Cause: CHW Dashboard Redirects to Home

The Dashboard page redirects to `/` because of an **auth race condition** in `useAuth` + `Dashboard`:

1. `useAuth` sets `loading = false` after `getSession()` resolves
2. But `fetchUserData()` (which fetches roles) is called via `setTimeout(..., 0)` -- it hasn't completed yet
3. Dashboard's `useEffect` fires: `authLoading=false` + `roles=[]` → `isChw()=false`, `isAdmin()=false` → **redirect to `/`**

The roles simply haven't loaded yet when the redirect decision is made.

## Root Cause: RLS Policies Still Restrictive

Despite 3 migration attempts, the `supabase-tables` context still shows `Permissive: No` on all policies. The `CREATE POLICY` statements didn't include the explicit `AS PERMISSIVE` clause. While PostgreSQL defaults to permissive, something in the migration chain may have preserved restrictive mode. We need one final migration with explicit `AS PERMISSIVE`.

---

## Phase 1: Fix Auth Race Condition

**File: `src/hooks/useAuth.ts`**
- Add a `rolesLoaded` state (initially `false`)
- Set `rolesLoaded = true` only after `fetchUserData` completes
- Expose `rolesLoaded` from the hook

**File: `src/pages/Dashboard.tsx`**
- Change the redirect guard to wait for `rolesLoaded` before checking roles:
  ```
  if (!authLoading && rolesLoaded && !isChw() && !isAdmin()) navigate('/')
  ```
- Show loading spinner while `!rolesLoaded`

**File: `src/components/auth/ProtectedRoute.tsx`**
- Same fix: wait for roles to be fetched before rendering "Access Denied"

## Phase 2: Final RLS Policy Fix (Explicit PERMISSIVE)

**Database migration:** Drop and recreate ALL policies with explicit `AS PERMISSIVE` on every table:
- `emergency_cases`, `profiles`, `user_roles`, `chw_assignments`
- `chat_sessions`, `chat_messages`, `sms_logs`, `audit_logs`
- `emergency_contacts`, `push_subscriptions`
- `health_facilities`, `first_aid_protocols`, `ussd_sessions`

Also restore the `on_auth_user_created` trigger (currently missing per db-triggers context).

## Phase 3: Platform-Wide CSRF Foundation

**File: `src/hooks/useCsrfToken.ts`** (update existing)
- Already generates per-session tokens -- extend with a `withCsrf(callback)` wrapper utility

**New file: `src/lib/csrf.ts`**
- `getCsrfToken()` - retrieve or generate session token
- `validateCsrfToken(token)` - validate against session
- `csrfHeaders()` - return `{ 'X-CSRF-Token': token }` for fetch calls

**Integrate into forms:**
- `EmergencyAlertModal.tsx` - add hidden CSRF field, validate before `handleSend`
- `ProfileForm.tsx` - validate CSRF token before `onSubmit`
- `src/pages/Auth.tsx` - add CSRF to signup/login forms
- `ChatInput.tsx` - add CSRF to message submissions

**Edge function updates (optional hardening):**
- Add `X-CSRF-Token` to allowed headers in CORS config across all edge functions

## Phase 4: Minor Fixes

- **`FirstAidProtocols.tsx`**: Add "View All" button functionality (currently a no-op button)
- **`EmergencyMap.tsx`**: Already correct with `[-4.0, 37.5]` center and fitBounds
- **Duplicate protocols**: `Heart Attack` exists in both `cardiac` and `heart_attack` categories; `Choking` in both `breathing` and `choking` -- clean these

## Execution Order

1. Database migration (RLS + trigger fix)
2. `useAuth.ts` race condition fix
3. `ProtectedRoute.tsx` + `Dashboard.tsx` guard fixes
4. CSRF utility creation and form integration
5. Protocol dedup + minor UI fixes

