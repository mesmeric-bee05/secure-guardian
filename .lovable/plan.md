

# Plan: Admin Analytics Dashboard, Protocol Completion, View All Fix, Security Resolution

## Issues Identified

1. **"View All Protocols" button does nothing** — it has no onClick handler, just renders a button
2. **10 protocols missing videos and reference books** — Nosebleed, Insect Stings, Dehydration, Malaria, Diabetic Emergency, Fainting, Child Fever, Asthma, Eye Injury, Wound Cleaning
3. **Protocol detail modal "Call Emergency" button** uses `window.location.href = 'tel:999'` — same desktop fallback issue already fixed in QuickDialButtons
4. **Chat input appears to work** — the textarea is present in code; the user's screenshot shows the chat page correctly. If it's not visible, it may be a layout/overflow issue on certain viewport sizes
5. **5 security findings remain** — need to be managed (Realtime broadcast accepted risks, chw_assignments escalation, audit log integrity, leaked password)
6. **No admin analytics dashboard** — needs to be added as a new tab

## Changes

### 1. Database Migration: Add Videos & Reference Books to 10 Protocols

Update 10 protocols that are missing `video_url` and `reference_books` with appropriate YouTube first aid videos and reference book links.

Protocols to update: Nosebleed Treatment, Insect & Scorpion Stings, Dehydration & Diarrhea, Malaria First Response, Diabetic Emergency, Fainting, Child Fever Management, Asthma Attack Response, Eye Injury First Aid, Wound Cleaning & Infection Prevention.

### 2. Fix "View All Protocols" Button

**File:** `src/components/home/FirstAidProtocols.tsx`

Add state `showAll` (default false). When false, show `protocols.slice(0, 6)`. When true, show all protocols. Button toggles `showAll` and changes label to "Show Less" / "Onyesha Kidogo".

### 3. Fix Protocol Modal "Call Emergency" Button

**File:** `src/components/home/ProtocolDetailModal.tsx` (line 299)

Replace `window.location.href = 'tel:999'` with `window.open('tel:999', '_self')` + clipboard/toast fallback (same pattern as QuickDialButtons).

### 4. Admin Analytics Dashboard Tab

**New file:** `src/components/admin/AnalyticsDashboardTab.tsx`

Real-time metrics dashboard with:
- **Summary cards**: Total users, active CHWs, total cases, open cases, avg response time
- **User growth chart**: Line chart showing new user registrations over time (from profiles table)
- **Case volume trends**: Area chart of daily new cases
- **System health indicators**: Edge function status, database connection status
- **CHW activity heatmap**: Bar chart showing active vs inactive CHWs

Data sources: `profiles`, `emergency_cases`, `chw_assignments`, `user_roles` tables.

**Modified files:**
- `src/components/admin/AdminSidebar.tsx` — add "Analytics" tab with Activity icon
- `src/pages/Admin.tsx` — add analytics case to tab switch

### 5. Security Findings Management

Manage the 5 remaining findings:
- **Leaked password protection**: Update as high remediation difficulty (requires cloud dashboard config)
- **Realtime broadcast (2 findings)**: Mark as ignored with justification — table-level RLS already restricts queries; Realtime subscriptions are scoped in client code
- **chw_assignments escalation**: Add explicit INSERT/UPDATE/DELETE deny policies via migration
- **audit_logs integrity**: Mark as ignored — service role only writes, no authenticated INSERT policy exists (RLS default-deny)

### 6. Chat Input Visibility Check

The chat input component exists and renders correctly in code. Will verify the textarea is visible by ensuring the flex layout doesn't clip it on small viewports. If the `min-h-[44px]` textarea is being hidden, adjust the parent container.

## Execution Order

1. Database migration: update 10 protocols with videos + books, add chw_assignments deny policies
2. Fix "View All Protocols" toggle in FirstAidProtocols.tsx
3. Fix "Call Emergency" button in ProtocolDetailModal.tsx
4. Create AnalyticsDashboardTab.tsx + wire into Admin page
5. Manage all 5 security findings

## Technical Details

### Protocol video sources (curated YouTube first aid channels)
- Nosebleed: St John Ambulance nosebleed video
- Insect Stings: Mayo Clinic insect sting treatment
- Dehydration: WHO ORS preparation tutorial
- Malaria: WHO malaria first response
- Diabetic Emergency: Diabetes UK hypoglycemia
- Fainting: British Red Cross fainting
- Child Fever: AAP fever management
- Asthma: Asthma UK inhaler technique
- Eye Injury: St John Ambulance eye injury
- Wound Cleaning: Red Cross wound care

### Analytics dashboard queries
- User growth: `SELECT date_trunc('day', created_at), COUNT(*) FROM profiles GROUP BY 1`
- Case trends: same pattern on `emergency_cases`
- CHW activity: `SELECT assigned_chw_id, COUNT(*) FROM emergency_cases WHERE status != 'resolved' GROUP BY 1`
- Response time: `AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600)` from emergency_cases

