

## Implementation Plan: Voice Emergency Testing, Real-time CHW Tracking, Bulk SMS Retry, Security Fixes, and Bug Fixes

This comprehensive plan addresses all requested features and fixes identified through thorough codebase analysis.

---

## Summary of Issues Found

After extensive testing and code review, I identified the following:

| Issue | Status | Description |
|-------|--------|-------------|
| Voice Emergency | Working | Button activates speech recognition correctly |
| AI Chat | Working | Messages sent and AI responds with streaming |
| Protocol Modal | Broken | Steps data format mismatch causes blank modal |
| Bulk SMS Retry | Missing | Only individual retry exists |
| Real-time CHW Tracking | Missing | No live GPS updates |
| Security Vulnerabilities | Found | Missing anonymous denial policies, leaked password protection disabled |
| Emergency Call Buttons | Working | Using `tel:` protocol correctly |

---

## Phase 1: Fix Protocol Detail Modal (Critical Bug)

**Problem**: The `first_aid_protocols` table stores steps as objects with `step_en` and `step_sw` keys:
```
[{step_en: "...", step_sw: "..."}, ...]
```

But the `getSteps` function in `useProtocols.ts` expects:
```
{en: ["..."], sw: ["..."]}
```

**Fix**: Update `useProtocols.ts` to handle the actual data format.

**File**: `src/hooks/useProtocols.ts`
- Modify `getSteps` function to extract `step_en` or `step_sw` from each object in the array

---

## Phase 2: Add Bulk SMS Retry Functionality

**Goal**: Allow admins to retry all failed SMS messages at once.

### 2.1 Update SMS Dashboard Tab
**File**: `src/components/admin/SMSDashboardTab.tsx`
- Add "Retry All Failed" button in the header
- Add checkbox selection for individual messages
- Add "Retry Selected" button
- Update the retry handler to support bulk operations
- Add progress indicator for bulk retry

### 2.2 Update SMS Retry Edge Function
**File**: `supabase/functions/sms-retry/index.ts`
- Increase maximum batch size from 10 to 50 for bulk operations
- Add support for "retry_all_failed" flag
- Add concurrency limiting to prevent overwhelming the SMS API
- Return detailed results for each message

---

## Phase 3: Add Real-time CHW Location Tracking

**Goal**: Enable live GPS updates from CHW mobile devices.

### 3.1 Database Migration
Add columns and realtime support:
```sql
-- Add last_known_location tracking
ALTER TABLE chw_assignments
ADD COLUMN last_location_update timestamp with time zone DEFAULT now();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE chw_assignments;
```

### 3.2 Create Location Update Edge Function
**File**: `supabase/functions/chw-location-update/index.ts`
- Accept GPS coordinates from mobile devices
- Validate CHW authentication
- Update location in database
- Rate limit to prevent excessive updates (max 1 per 30 seconds)

### 3.3 Create useRealtimeCHWLocations Hook
**File**: `src/hooks/useRealtimeCHWLocations.ts`
- Subscribe to realtime changes on `chw_assignments` table
- Provide live location data to map components
- Handle connection/disconnection gracefully

### 3.4 Update CHW Location Map
**File**: `src/components/admin/CHWLocationMap.tsx`
- Integrate realtime location updates
- Add pulsing indicators for recently updated locations
- Add "last seen" timestamp for each CHW marker
- Add auto-refresh toggle

### 3.5 Add Location Sharing for CHWs
**File**: `src/components/dashboard/LocationSharing.tsx` (new)
- Component for CHWs to enable/disable location sharing
- Background geolocation updates
- Battery-conscious update frequency options

---

## Phase 4: Comprehensive Security Fixes

### 4.1 Add Anonymous Denial Policies
Database migration to add explicit denial policies:

```sql
-- Deny anonymous access to profiles
CREATE POLICY "Deny anonymous access to profiles"
  ON public.profiles FOR ALL
  TO anon
  USING (false);

-- Deny anonymous access to emergency_contacts
CREATE POLICY "Deny anonymous access to emergency_contacts"
  ON public.emergency_contacts FOR ALL
  TO anon
  USING (false);

-- Deny anonymous access to emergency_cases
CREATE POLICY "Deny anonymous access to emergency_cases"
  ON public.emergency_cases FOR ALL
  TO anon
  USING (false);

-- Deny anonymous access to audit_logs
CREATE POLICY "Deny anonymous access to audit_logs"
  ON public.audit_logs FOR ALL
  TO anon
  USING (false);

-- Deny anonymous access to user_roles
CREATE POLICY "Deny anonymous access to user_roles"
  ON public.user_roles FOR ALL
  TO anon
  USING (false);

-- Deny anonymous access to ussd_sessions
CREATE POLICY "Deny anonymous access to ussd_sessions"
  ON public.ussd_sessions FOR ALL
  TO anon
  USING (false);

-- Deny anonymous access to sms_logs
CREATE POLICY "Deny anonymous access to sms_logs"
  ON public.sms_logs FOR ALL
  TO anon
  USING (false);

-- Deny anonymous access to chat_sessions
CREATE POLICY "Deny anonymous access to chat_sessions"
  ON public.chat_sessions FOR ALL
  TO anon
  USING (false);

-- Deny anonymous access to chat_messages
CREATE POLICY "Deny anonymous access to chat_messages"
  ON public.chat_messages FOR ALL
  TO anon
  USING (false);

-- Deny anonymous access to chw_assignments
CREATE POLICY "Deny anonymous access to chw_assignments"
  ON public.chw_assignments FOR ALL
  TO anon
  USING (false);
```

### 4.2 Enable Leaked Password Protection
Configure via Supabase Auth settings to enable leaked password protection.

### 4.3 Code Security Review (Already Secure)
After reviewing the codebase:
- No hardcoded secrets found (all secrets in environment variables)
- No SQL injection vulnerabilities (using Supabase client with parameterized queries)
- No exposed API keys in frontend code
- Rate limiting implemented on all edge functions
- Input validation present on all edge functions

---

## Phase 5: Additional UI/UX Fixes

### 5.1 Fix Dialog Accessibility Warning
**File**: `src/components/ui/dialog.tsx`
- Add `DialogDescription` to dialogs that are missing it
- This fixes the console warning about missing descriptions

### 5.2 Add Loading States
Ensure all async operations show proper loading indicators.

---

## Files to Create

| File | Description |
|------|-------------|
| `supabase/functions/chw-location-update/index.ts` | CHW location update endpoint |
| `src/hooks/useRealtimeCHWLocations.ts` | Realtime CHW location hook |
| `src/components/dashboard/LocationSharing.tsx` | CHW location sharing component |

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useProtocols.ts` | Fix getSteps to handle actual data format |
| `src/components/admin/SMSDashboardTab.tsx` | Add bulk retry functionality |
| `supabase/functions/sms-retry/index.ts` | Support bulk retry operations |
| `src/components/admin/CHWLocationMap.tsx` | Add realtime location updates |
| `supabase/config.toml` | Add chw-location-update function |

## Database Migrations

1. Add `last_location_update` column to `chw_assignments`
2. Enable realtime on `chw_assignments` table
3. Add anonymous denial policies to all sensitive tables

---

## Architecture Diagram

```text
Real-time CHW Location Flow:
+-------------------+     +------------------------+
| CHW Mobile Device | --> | chw-location-update    |
| (GPS Location)    |     | Edge Function          |
+-------------------+     +-----------+------------+
                                      |
                                      v
                          +-----------+------------+
                          | chw_assignments table  |
                          | (with realtime)        |
                          +-----------+------------+
                                      |
                                      | Realtime subscription
                                      v
                          +-----------+------------+
                          | Admin Dashboard        |
                          | CHW Location Map       |
                          +------------------------+

Bulk SMS Retry Flow:
+------------------+     +-------------------+
| Admin selects    | --> | sms-retry         |
| failed messages  |     | Edge Function     |
+------------------+     +---------+---------+
                                   |
                    +------+-------+-------+------+
                    |      |       |       |      |
                    v      v       v       v      v
                +------------------------------------------+
                | Africa's Talking API (concurrent calls)  |
                +------------------------------------------+
                    |      |       |       |      |
                    v      v       v       v      v
                +-----------+------------+
                | sms_logs (update)      |
                +------------------------+
```

---

## Security Considerations

1. **Defense in Depth**: Anonymous denial policies add extra layer even when RLS is properly configured
2. **Rate Limiting**: Location updates limited to 1 per 30 seconds per CHW
3. **Authentication**: All location updates require valid CHW authentication
4. **Audit Logging**: All retry operations logged for accountability
5. **Input Validation**: GPS coordinates validated for valid ranges

---

## Testing Plan

After implementation:
1. Click on any protocol card - should show modal with steps
2. Go to Admin SMS Dashboard - verify "Retry All Failed" button appears
3. Test bulk retry with multiple failed messages
4. As CHW, enable location sharing and verify updates appear on admin map
5. Verify anonymous users cannot access any protected tables
6. Check console for any remaining errors

