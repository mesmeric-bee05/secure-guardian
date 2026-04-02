

# Plan: Push Notifications on Case Assignment, Enhanced Reports, Chat CSRF Test, Security Fixes

## Phase 1: Database Security Fixes (Migration)

The security scan found several issues that need immediate fixes:

1. **USSD sessions table** -- has RLS enabled but no policies. Add a service-role-only deny-all policy (this table is only accessed from edge functions with service role key)
2. **Audit logs INSERT policy** -- currently any authenticated user can insert audit logs for their own user_id. Restrict INSERT to service role only by dropping the current policy and leaving inserts to edge functions (which use service_role_key). Alternatively, tighten the policy to only allow inserts where the action matches known patterns.
3. **Missing `Access-Control-Allow-Methods` and `X-Content-Type-Options`** headers in edge functions -- add to all CORS headers

**Migration SQL:**
- Drop the permissive INSERT policy on `audit_logs` (audit log insertion happens via service-role in edge functions, not from client)
- Add RLS policies on `ussd_sessions` to deny all access for `anon` and `authenticated` roles (service role bypasses RLS)

## Phase 2: Push Notification on Case Assignment

The `emergency-alert` edge function **already calls `send-push-notification`** when a CHW is assigned (lines 310-327). This is working. However, improvements needed:

1. **Push notification also for case status updates** -- create a database trigger or enhance the Dashboard's case update flow to send push notifications when a CHW updates case status (so the patient gets notified)
2. **Create `notify-case-update` edge function** -- lightweight function that sends push to the case's `user_id` when status changes to `in_progress` or `resolved`
3. **Call from Dashboard** -- after a CHW updates case status, invoke the notification function

### New edge function: `supabase/functions/notify-case-update/index.ts`
- Accepts `case_id` and `new_status`
- Validates JWT, confirms caller is the assigned CHW
- Fetches case's `user_id`, sends push notification with status update message
- Rate limited (10/min per user)

### Dashboard integration
- In `CaseDetailModal.tsx` (or wherever status updates happen), after successful status update, call `supabase.functions.invoke('notify-case-update', ...)`

## Phase 3: Enhanced Reporting Dashboard

The Reports page already has a solid foundation with trends, pie charts, bar charts, CHW performance table, and CSV export. Enhancements:

1. **Response Time Chart** -- add a chart showing average time-to-assignment and time-to-resolution over the date range (using `created_at` vs `updated_at` for assignment, `resolved_at` for resolution)
2. **CHW Performance with names** -- join CHW IDs with profiles to show names instead of truncated UUIDs
3. **PDF/Image export** -- add a "Download Report" button using `html2canvas` to capture charts as images (or keep CSV-only for simplicity)
4. **Regional breakdown** -- add a horizontal bar chart showing cases by `location_address` region

### Files modified:
- `src/pages/Reports.tsx` -- add response time metrics, regional breakdown chart, fetch CHW profile names
- `src/components/reports/ResponseTimeChart.tsx` -- new component for response time visualization

## Phase 4: Chat CSRF Verification

The `ChatInput.tsx` already has CSRF validation (lines 48-52). To verify end-to-end:
- Navigate to `/chat`, send a message, confirm it works
- The CSRF check in ChatInput validates the token before calling `onSend`
- No code changes needed -- this is a verification step

## Phase 5: Security Hardening

1. **Add `Access-Control-Allow-Methods` and `X-Content-Type-Options: nosniff`** to all edge function CORS headers that are missing them:
   - `ai-chat/index.ts`
   - `sms-gateway/index.ts`  
   - `emergency-alert/index.ts`
   (The `send-push-notification` already has these)

2. **Realtime RLS** -- the scan flagged `emergency_cases` and `chw_assignments` being broadcast to all subscribers. This is a known limitation; document as accepted risk since table-level RLS already restricts query access, and realtime channel names can be scoped in client code.

## Execution Order

1. Database migration (audit_logs + ussd_sessions RLS fixes)
2. Edge function CORS hardening (ai-chat, sms-gateway, emergency-alert -- add methods + nosniff headers)
3. Create `notify-case-update` edge function
4. Integrate push notification call in Dashboard case update flow
5. Enhance Reports page (response time chart, CHW names, regional breakdown)
6. Update security findings (mark fixed items, document accepted risks)

## Technical Details

### CORS header additions (all 3 edge functions)
```typescript
// Add to getCorsHeaders return object:
'Access-Control-Allow-Methods': 'POST, OPTIONS',
'X-Content-Type-Options': 'nosniff',
```

### notify-case-update edge function
- Auth: JWT validation via `getClaims`
- Authorization: verify caller is `assigned_chw_id` on the case OR admin
- Push payload: `{ title: "Case Update", body: "Your case status: {status}" }`
- Uses service role to fetch case and send push

### Reports enhancements
- Response time = `resolved_at - created_at` in hours, grouped by day
- CHW names fetched via `profiles` table join (admin/CHW roles can see relevant profiles)
- Regional breakdown extracts city/region from `location_address`

