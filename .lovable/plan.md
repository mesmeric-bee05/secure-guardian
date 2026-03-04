

# Plan: Tanzania Data Expansion, Duplicate Cleanup, Protocol Addition & Dashboard Fix

## Current State Assessment

**Database status:**
- 5 health facilities (3 Nairobi, 1 Dar es Salaam, 1 Mombasa) -- only 1 Tanzania facility
- 19 first aid protocols with some duplicates (e.g., "Severe Bleeding" appears in both `bleeding` and `trauma` categories; "Burns Treatment" twice; "Choking" in `breathing` and `choking`; "Heart Attack" in `cardiac` and `heart_attack`; "Fractures" in `fractures` and `trauma`)
- 1 user with all 3 roles (user, chw, admin)
- 2 emergency cases, 3 CHW assignments (Kenya-based)
- CHW regions list in `CHWManagementTab.tsx` is Kenya-only

**CHW Dashboard issue:** The Dashboard page at `/dashboard` should work for CHW/admin users. The `useRealtimeCases` hook fetches cases and subscribes to realtime. Potential issues:
1. RLS policies use `RESTRICTIVE` (not permissive) -- all policies are restrictive, meaning they must ALL pass. The "Deny anonymous access" policy with `USING (false)` blocks anonymous users entirely, but for authenticated users with the right role it should work since they match at least one other restrictive policy. Actually, wait -- **restrictive policies are AND-ed together**. The "Deny anonymous" policy targets `public` role. Let me re-check... The policies shown say `Permissive: No` which means they're restrictive. In PostgreSQL, restrictive policies must ALL pass. If "Deny anonymous access" has `USING (false)` and is restrictive, it would block ALL access including authenticated users. This is likely the root cause of the CHW Dashboard not working.

Let me verify -- the "Deny anonymous" policies are applied to role `public` (all users), with `USING (false)`. If restrictive, this would deny everyone. This is almost certainly the bug.

## Phase 1: Fix RLS Policies (Critical - CHW Dashboard Fix)

The "Deny anonymous access" policies on `emergency_cases`, `profiles`, `user_roles`, `chw_assignments`, `chat_sessions`, `chat_messages`, `sms_logs`, `audit_logs`, `emergency_contacts`, and `push_subscriptions` are marked as restrictive (`Permissive: No`). When restrictive, ALL policies must pass. Since `USING (false)` always fails, no one can access these tables.

**Fix:** Drop all "Deny anonymous access" restrictive policies and replace with proper `anon` role denial using permissive policies, or simply remove them since the other policies already target `authenticated` role only.

**Database migration:**
- Drop all "Deny anonymous access" restrictive policies across all affected tables
- The existing permissive policies targeting `authenticated` already provide proper access control

## Phase 2: Insert Tanzania Health Facilities (~15 facilities)

Add verified Tanzania facilities covering major cities:
- Dar es Salaam: Muhimbili (already exists), Aga Khan DSM, Temeke Regional, Amana Regional, Mwananyamala Regional
- Dodoma: Dodoma Regional, Benjamin Mkapa Hospital  
- Arusha: Mount Meru Regional, KCMC (Moshi)
- Mwanza: Bugando Medical Centre, Sekou Toure Regional
- Mbeya: Mbeya Zonal Referral
- Tanga: Bombo Regional
- Zanzibar: Mnazi Mmoja Hospital
- Morogoro: Morogoro Regional

Each with real coordinates, phone numbers, services, and `is_verified = true`.

## Phase 3: Clean Duplicate Protocols & Add New Ones

**Clean duplicates** (delete by ID):
- Remove duplicate "Severe Bleeding" in `trauma` category (id: `8746d13f...`)
- Remove duplicate "Burns Treatment" without severity (id: `18ec48a0...`)
- Remove duplicate "Fractures" in `trauma` category (id: `ae93a0dd...`)

**Add ~10 new protocols** covering gaps:
1. Malaria First Response (common in Tanzania)
2. Dehydration & Diarrhea Management
3. Wound Cleaning & Infection Prevention
4. Fainting / Loss of Consciousness
5. Asthma Attack
6. Eye Injuries
7. Nosebleed Treatment
8. Insect/Scorpion Stings
9. Diabetic Emergency
10. Child Fever Management

Each with bilingual EN/SW content, structured steps, red flags, and severity levels.

## Phase 4: Code Fixes

1. **Update CHW regions list** in `CHWManagementTab.tsx` to include Tanzania regions (Dar es Salaam, Dodoma, Arusha, Mwanza, Mbeya, Tanga, Zanzibar, Morogoro, etc.)

2. **Fix `CaseDetailModal` state reset bug** -- line 81 uses `useState()` instead of `useEffect()` to reset state when `caseData` changes

3. **Add global unhandled rejection handler** in `App.tsx` as a safety net

4. **Update EmergencyMap default center** to support Tanzania (detect based on facilities or use a center point between Kenya/Tanzania)

## Technical Details

### RLS Fix SQL (Migration)
```sql
-- Drop all restrictive "Deny anonymous" policies
DROP POLICY IF EXISTS "Deny anonymous access to emergency_cases" ON public.emergency_cases;
DROP POLICY IF EXISTS "Deny anonymous access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Deny anonymous access to user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Deny anonymous access to chw_assignments" ON public.chw_assignments;
DROP POLICY IF EXISTS "Deny anonymous access to chat_sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Deny anonymous access to chat_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Deny anonymous access to sms_logs" ON public.sms_logs;
DROP POLICY IF EXISTS "Deny anonymous access to audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Deny anonymous access to emergency_contacts" ON public.emergency_contacts;
DROP POLICY IF EXISTS "Deny anonymous access to push_subscriptions" ON public.push_subscriptions;
```

### Data Insertions
- Use the insert tool for all facility and protocol data operations
- Delete duplicate protocols by ID before inserting new ones

### Code Changes
- `src/components/admin/CHWManagementTab.tsx`: Update regions array
- `src/components/dashboard/CaseDetailModal.tsx`: Fix `useState` -> `useEffect`
- `src/App.tsx`: Add unhandled rejection handler
- `src/components/emergency/EmergencyMap.tsx`: Adjust default center

## Execution Order
1. Database migration to fix RLS policies
2. Delete duplicate protocols
3. Insert Tanzania facilities
4. Insert new protocols
5. Code fixes (all in parallel)

