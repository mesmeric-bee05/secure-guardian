

# Plan: Security Hardening, End-to-End Verification, and Project Polish

## Current State Assessment

### Security Scan Results (4 new findings + 3 existing)
1. **Realtime channel authorization** (error) -- already ignored with justification
2. **Privilege escalation role assignment** (warn) -- `has_role` function verified: it is SECURITY DEFINER with fixed `search_path`
3. **SMS logs write protection** (warn) -- no INSERT/UPDATE/DELETE policies exist, which means default-deny is active (correct)
4. **CHW unassigned cases visibility** (warn) -- intentional design for emergency triage workflow
5. **Leaked password protection** (warn) -- requires Cloud dashboard config, already documented
6. **USSD sessions fragile pattern** (ignored) -- already justified
7. **Circular trust in user_roles** (ignored) -- already justified

### Code & Feature Status
- **40 protocols** all have `video_url` and `reference_books` populated
- **View All Protocols** toggle works (showAll state in FirstAidProtocols.tsx)
- **ProtocolVideoResource** renders YouTube thumbnail + external "Watch Demo" link (no iframe)
- **Emergency quick-dial** has mobile `tel:` + desktop clipboard/toast fallback
- **Chat input** renders correctly with CSRF validation, voice support, character counter
- **Analytics dashboard** exists with summary cards, charts, CHW metrics

## Changes

### 1. Manage Security Findings (4 new scan findings)

Use `security--manage_security_finding` to resolve all 4 new findings:

- **Realtime channel auth**: Ignore -- `realtime.messages` is a reserved schema; cannot add user RLS policies. Client code scopes subscriptions. Table-level RLS restricts query results.
- **Privilege escalation**: Ignore -- `has_role()` is confirmed SECURITY DEFINER with `search_path = public`. Standard Supabase RBAC pattern. No exploit path exists.
- **SMS logs write protection**: Ignore -- no INSERT/UPDATE/DELETE policies = PostgreSQL default-deny. Only service role (edge functions) writes to this table.
- **CHW unassigned cases**: Ignore -- intentional triage design. CHWs must see nearby unassigned cases to respond to emergencies. This is a core workflow requirement.

### 2. Browser Verification (3 flows)

**Flow A: Protocol Modal**
- Navigate to home page
- Click "View All Protocols" to expand list
- Open "Anaphylaxis & Severe Allergic Reactions" protocol
- Verify video thumbnail and "Watch Demo" button render
- Verify reference books section displays

**Flow B: Emergency Quick-Dial**
- Navigate to /emergency
- Click Emergency, Ambulance, Police, Fire buttons
- Verify toast notifications appear with phone number on desktop

**Flow C: Chat**
- Navigate to /chat
- Verify textarea is visible
- Send a test message and confirm AI response streams

### 3. Minor Polish (if issues found during verification)
- Fix any layout/rendering issues discovered during browser testing
- Ensure all buttons are responsive and functional

## Execution Order
1. Manage all 4 security findings
2. Browser verify protocol modal flow
3. Browser verify emergency buttons
4. Browser verify chat input and response

## Technical Details

All security findings are being resolved via documentation/justification rather than code changes because:
- Default-deny is already in place for tables without explicit write policies
- Realtime channel authorization cannot be enforced via user-defined RLS on reserved schemas
- The RBAC circular dependency is a standard pattern with ACID guarantees
- CHW visibility of unassigned cases is an intentional emergency response design decision

