
## Implementation Plan: SMS Delivery, User Onboarding, Push Notifications & Offline-First

This plan implements four major features in sequence, each building on top of the existing architecture.

---

## Current State Analysis

| Component | Status | Notes |
|-----------|--------|-------|
| SMS Gateway | Ready | `AFRICAS_TALKING_API_KEY` and `AFRICAS_TALKING_USERNAME` already configured |
| Onboarding | Not implemented | Users go directly to home after signup |
| Push Notifications | Partial | `usePushNotifications` hook exists but not integrated with real-time CHW notifications |
| Offline Storage | Partial | IndexedDB wrapper exists, background sync implemented |

---

## Feature 1: Enable SMS Delivery

**Status**: Already configured - no code changes needed

The Africa's Talking credentials are already set up as secrets:
- `AFRICAS_TALKING_API_KEY` - configured
- `AFRICAS_TALKING_USERNAME` - configured

The edge functions (`sms-gateway`, `emergency-alert`, `sms-retry`) already use these credentials. SMS delivery is functional.

**Verification**: Test by creating an emergency alert with a real phone number in emergency contacts.

---

## Feature 2: User Onboarding Flow

### Overview
Create a step-by-step onboarding wizard that appears after signup to guide users through:
1. Welcome screen with app introduction
2. Profile setup (name, phone, language)
3. Medical information (blood type, allergies, conditions)
4. Emergency contacts (add at least one)
5. Location preferences (enable location services)
6. Notification preferences (enable push notifications)

### Database Changes
Add `onboarding_completed` field to `profiles` table:

```sql
ALTER TABLE profiles 
ADD COLUMN onboarding_completed boolean DEFAULT false;
```

### New Files to Create

**`src/pages/Onboarding.tsx`**
Main onboarding wizard page with step navigation:
- Multi-step form with progress indicator
- Skip option with confirmation
- Completion tracking in profile

**`src/components/onboarding/OnboardingWelcome.tsx`**
Welcome step with app features overview:
- App logo and name
- Key features list (AI chat, emergency alerts, offline support)
- "Get Started" button

**`src/components/onboarding/OnboardingProfile.tsx`**
Profile setup step:
- Full name input
- Phone number input
- Language selection (English/Kiswahili)
- Date of birth (optional)

**`src/components/onboarding/OnboardingMedical.tsx`**
Medical information step:
- Blood type selector
- Allergies textarea
- Medical conditions textarea
- "Skip for now" option

**`src/components/onboarding/OnboardingContacts.tsx`**
Emergency contacts step:
- Add contact form (name, phone, relationship)
- Display added contacts
- Minimum one contact recommended

**`src/components/onboarding/OnboardingLocation.tsx`**
Location preferences step:
- Explain why location is needed
- Request location permission button
- Show current location if granted
- Skip option

**`src/components/onboarding/OnboardingNotifications.tsx`**
Notification preferences step:
- Explain notification benefits
- Request notification permission button
- Show permission status
- Complete onboarding button

**`src/components/onboarding/OnboardingProgress.tsx`**
Progress indicator component:
- Step numbers with labels
- Current step highlighting
- Completed step checkmarks

### Files to Modify

**`src/App.tsx`**
Add onboarding route:
```tsx
<Route path="/onboarding" element={
  <ProtectedRoute><Onboarding /></ProtectedRoute>
} />
```

**`src/pages/Auth.tsx`**
Redirect to onboarding after signup if `onboarding_completed` is false:
- Check profile after successful signup/login
- Navigate to `/onboarding` if not completed

**`src/hooks/useAuth.ts`**
Add `onboarding_completed` to Profile interface and fetch logic

---

## Feature 3: CHW Push Notifications

### Overview
Enable real-time push notifications for CHWs when:
- New emergency case is assigned to them
- Case priority is upgraded
- Case status changes

### Database Changes
Create `push_subscriptions` table to store Web Push subscriptions:

```sql
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### New Files to Create

**`supabase/functions/send-push-notification/index.ts`**
Edge function to send Web Push notifications:
- Accepts notification payload (title, body, data, user_id)
- Fetches user's push subscriptions
- Sends notification via Web Push API
- Uses VAPID keys for authentication

**`supabase/functions/chw-case-notification/index.ts`**
Edge function triggered by case assignment:
- Called when emergency_case is created/updated
- Finds assigned CHW
- Sends push notification with case details

**`src/hooks/usePushSubscription.ts`**
Hook to manage push subscriptions:
- Subscribe to push notifications
- Save subscription to database
- Unsubscribe functionality
- Check subscription status

### Files to Modify

**`src/hooks/usePushNotifications.ts`**
Enhance with subscription management:
- Add `subscribe()` method to save subscription to DB
- Add `unsubscribe()` method
- Track `isSubscribed` state from database

**`src/hooks/useRealtimeCases.ts`**
Already integrates with push notifications - ensure it triggers properly

**`src/pages/Dashboard.tsx`**
Add notification enable prompt for CHWs:
- Show banner if notifications not enabled
- One-click enable button

**`supabase/functions/emergency-alert/index.ts`**
Add push notification trigger after CHW assignment:
- Call `send-push-notification` function after assigning CHW
- Include case ID, symptoms summary, priority in notification

### VAPID Keys Setup
Will need to generate VAPID keys and add as secrets:
- `VAPID_PUBLIC_KEY` - used in frontend
- `VAPID_PRIVATE_KEY` - used in edge function

---

## Feature 4: Offline-First Functionality

### Overview
Make the app fully functional without internet:
- Cache all critical data locally
- Queue actions when offline
- Sync automatically when online
- Show offline indicators and queued item counts

### Database Changes
None required - using existing IndexedDB implementation

### Files to Modify

**`src/lib/offlineStorage.ts`**
Extend with additional stores and methods:
- Add `pendingActions` store for queued operations
- Add `userProfile` store for cached profile
- Add `lastSyncTimestamp` tracking
- Add methods: `queueAction()`, `getPendingActions()`, `clearPendingAction()`

**`src/hooks/useBackgroundSync.ts`**
Enhance sync capabilities:
- Sync all pending actions (not just emergency alerts)
- Prioritize critical actions (emergencies first)
- Report sync progress
- Handle partial sync failures

### New Files to Create

**`src/hooks/useOfflineData.ts`**
Hook for offline data management:
- Cache protocols on first load
- Cache facilities on first load
- Cache user profile
- Return cached data when offline
- Merge with fresh data when online

**`src/hooks/useOfflineChat.ts`**
Offline chat functionality:
- Store chat messages locally
- Queue unsent messages
- Sync when online
- Show pending indicator on messages

**`src/components/offline/OfflineBanner.tsx`**
Enhanced offline indicator:
- Show pending item count
- Show last sync time
- Manual sync button
- Sync progress indicator

**`src/components/offline/PendingActionsIndicator.tsx`**
Shows queued offline actions:
- Badge with count
- Expandable list of pending items
- Individual item status

### Files to Modify

**`src/hooks/useFacilities.ts`**
Add offline caching:
- Cache facilities to IndexedDB on fetch
- Return cached data when offline
- Show stale data indicator

**`src/hooks/useProtocols.ts`**
Add offline caching:
- Cache protocols to IndexedDB
- Return cached data when offline

**`src/pages/Chat.tsx`**
Handle offline mode:
- Queue messages when offline
- Show pending indicator
- Disable AI chat when offline (show message)

**`src/pages/Emergency.tsx`**
Enhanced offline handling:
- Use cached facilities when offline
- Queue emergency alerts locally
- Show confirmation of queued alert
- Display sync status

**`src/components/emergency/EmergencyAlertModal.tsx`**
Offline alert submission:
- Detect offline state
- Save to IndexedDB instead of API call
- Show "Will send when online" message
- Track pending alerts count

**`src/App.tsx`**
Enhanced offline indicator:
- Replace simple indicator with OfflineBanner
- Show pending actions count globally

---

## Implementation Order

```text
Phase 1: SMS Verification (Already Complete)
    |
    v
Phase 2: User Onboarding
    |-- Create onboarding components
    |-- Add database migration
    |-- Update Auth flow
    |-- Test complete flow
    |
    v
Phase 3: CHW Push Notifications
    |-- Generate VAPID keys
    |-- Create push_subscriptions table
    |-- Build edge functions
    |-- Integrate with frontend
    |-- Test notification delivery
    |
    v
Phase 4: Offline-First
    |-- Extend IndexedDB stores
    |-- Add caching to hooks
    |-- Create offline UI components
    |-- Implement action queueing
    |-- Test offline scenarios
```

---

## Technical Details

### Onboarding State Machine

```text
                   +------------------+
                   |     Welcome      |
                   +--------+---------+
                            |
                            v
                   +------------------+
                   |  Profile Setup   |
                   +--------+---------+
                            |
                            v
                   +------------------+
                   | Medical Info     |
                   +--------+---------+
                            |
                            v
                   +------------------+
                   | Emergency        |
                   | Contacts         |
                   +--------+---------+
                            |
                            v
                   +------------------+
                   |    Location      |
                   +--------+---------+
                            |
                            v
                   +------------------+
                   |  Notifications   |
                   +--------+---------+
                            |
                            v
                   +------------------+
                   |    Complete!     |
                   +------------------+
```

### Push Notification Flow

```text
Emergency Created
       |
       v
+------------------+
| emergency-alert  |
| edge function    |
+--------+---------+
         |
         | assigns CHW
         v
+------------------+
| send-push-       |
| notification     |
+--------+---------+
         |
         | fetch subscriptions
         v
+------------------+
| push_subscriptions|
| table            |
+------------------+
         |
         v
+------------------+
| Web Push API     |
| (browser)        |
+------------------+
```

### Offline Data Strategy

| Data Type | Cache Strategy | Sync Priority |
|-----------|----------------|---------------|
| Emergency Alerts | Queue immediately, sync first | Critical |
| Chat Messages | Queue with timestamp | High |
| Profile Updates | Queue, merge on sync | Medium |
| Facilities | Cache on fetch, refresh when online | Low |
| Protocols | Cache on fetch, refresh weekly | Low |

---

## Files Summary

### New Files (14 files)
- `src/pages/Onboarding.tsx`
- `src/components/onboarding/OnboardingWelcome.tsx`
- `src/components/onboarding/OnboardingProfile.tsx`
- `src/components/onboarding/OnboardingMedical.tsx`
- `src/components/onboarding/OnboardingContacts.tsx`
- `src/components/onboarding/OnboardingLocation.tsx`
- `src/components/onboarding/OnboardingNotifications.tsx`
- `src/components/onboarding/OnboardingProgress.tsx`
- `src/hooks/usePushSubscription.ts`
- `src/hooks/useOfflineData.ts`
- `src/hooks/useOfflineChat.ts`
- `src/components/offline/OfflineBanner.tsx`
- `src/components/offline/PendingActionsIndicator.tsx`
- `supabase/functions/send-push-notification/index.ts`

### Modified Files (12 files)
- `src/App.tsx`
- `src/pages/Auth.tsx`
- `src/pages/Chat.tsx`
- `src/pages/Emergency.tsx`
- `src/pages/Dashboard.tsx`
- `src/hooks/useAuth.ts`
- `src/hooks/usePushNotifications.ts`
- `src/hooks/useBackgroundSync.ts`
- `src/hooks/useFacilities.ts`
- `src/hooks/useProtocols.ts`
- `src/lib/offlineStorage.ts`
- `src/components/emergency/EmergencyAlertModal.tsx`
- `supabase/functions/emergency-alert/index.ts`

### Database Migrations
1. Add `onboarding_completed` column to `profiles`
2. Create `push_subscriptions` table with RLS policies

### New Secrets Required
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`

---

## Testing Checklist

### Onboarding
- [ ] New user sees onboarding after signup
- [ ] Existing user with completed onboarding skips to home
- [ ] All steps can be completed
- [ ] Skip option works with confirmation
- [ ] Profile data is saved correctly
- [ ] Emergency contact is added successfully

### Push Notifications
- [ ] CHW can enable notifications
- [ ] Subscription is saved to database
- [ ] New case assignment triggers notification
- [ ] Notification opens to correct page
- [ ] Works on mobile browsers

### Offline
- [ ] App works without internet
- [ ] Emergency alerts are queued
- [ ] Queued alerts sync when online
- [ ] Cached facilities display offline
- [ ] Cached protocols display offline
- [ ] Pending count displays correctly
