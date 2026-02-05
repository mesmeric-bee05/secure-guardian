

## Implementation Plan: Testing Features & Fixing Clickable Prompts

This plan addresses all the testing tasks and fixes the bug where suggested chat prompts are not clickable.

---

## Issues Identified

| Issue | Status | Fix Required |
|-------|--------|--------------|
| Manual chat input | ✅ Working | None - text input works correctly |
| Suggested prompts not clickable | ❌ Bug | Add `onClick` handler to send prompt |
| Admin access denied | ❌ User lacks role | Add `admin` role to test user |
| CHW map not visible | ❌ User lacks admin role | Add admin role to access page |
| No failed SMS to test | ❌ Missing data | Insert test failed SMS entries |
| Leaked password protection | ⚠️ Manual step | User must enable in Cloud Dashboard |

---

## Phase 1: Fix Clickable Suggested Prompts

**File**: `src/components/chat/ChatMessageList.tsx`

**Problem**: Lines 55-61 show buttons for suggested prompts without an `onClick` handler:
```tsx
<button
  key={index}
  className="w-full text-left p-3 rounded-lg border bg-card hover:bg-accent transition-colors text-sm"
>
  {prompt}
</button>
```

**Solution**: Add an `onSendPrompt` prop to the component and wire it to the buttons:

1. Update the interface to accept a callback:
```tsx
interface ChatMessageListProps {
  messages: Message[];
  isLoading: boolean;
  language: Language;
  onSpeak?: (text: string) => void;
  onSendPrompt?: (prompt: string) => void; // NEW
}
```

2. Add `onClick` to the buttons:
```tsx
<button
  key={index}
  onClick={() => onSendPrompt?.(prompt)}
  className="..."
>
  {prompt}
</button>
```

3. Update `src/pages/Chat.tsx` to pass the handler:
```tsx
<ChatMessageList
  messages={messages}
  isLoading={isLoading}
  language={language}
  onSpeak={isSupported ? handleSpeak : undefined}
  onSendPrompt={sendMessage}  // NEW
/>
```

---

## Phase 2: Add Admin Role for Testing

**Database**: Insert admin role for test user

```sql
INSERT INTO user_roles (user_id, role)
VALUES ('219df603-ecb4-4045-bf1f-f62c78c7c5a9', 'admin');
```

This allows access to:
- Admin panel at `/admin`
- CHW Management tab with map
- SMS Dashboard with bulk retry

---

## Phase 3: Add Failed SMS Test Data

**Database**: Insert test failed SMS entries

```sql
INSERT INTO sms_logs (phone_number, message, status, direction, failure_reason, user_id)
VALUES 
  ('+254711111111', 'Emergency alert: Patient needs immediate assistance', 'failed', 'outbound', 'Network timeout', '219df603-ecb4-4045-bf1f-f62c78c7c5a9'),
  ('+254722222222', 'Your appointment has been confirmed', 'failed', 'outbound', 'Invalid phone number', '219df603-ecb4-4045-bf1f-f62c78c7c5a9'),
  ('+254733333333', 'CHW assigned to your case: Dr. Smith', 'failed', 'outbound', 'Carrier rejected', '219df603-ecb4-4045-bf1f-f62c78c7c5a9');
```

---

## Phase 4: Testing Verification Steps

After implementation:

### 4.1 Test Suggested Prompts
1. Go to `/chat` page
2. Click on any suggested prompt (e.g., "My child has a high fever")
3. Verify the message is sent and AI responds

### 4.2 Test CHW Location Map
1. Go to `/admin` (will work after admin role added)
2. Click "CHW Management" tab
3. Switch to "Map" view
4. Verify 3 CHW markers appear (Nairobi, Mombasa, Kisumu)
5. Nairobi marker should have pulsing animation (recent update)

### 4.3 Test Bulk SMS Retry
1. Go to `/admin` > "SMS Dashboard" tab
2. Verify 3 failed SMS entries appear
3. Click "Retry All Failed" button
4. Verify progress indicator shows
5. Check retry count updates

### 4.4 Test Emergency Flow (End-to-End)
1. Go to `/emergency` page
2. Click "Voice Emergency" button
3. Speak symptoms (e.g., "I have chest pain")
4. Verify voice is transcribed
5. Check that nearest CHW can be assigned

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/chat/ChatMessageList.tsx` | Add `onSendPrompt` prop, wire to button clicks |
| `src/pages/Chat.tsx` | Pass `sendMessage` as `onSendPrompt` prop |

## Database Changes

| Table | Operation | Data |
|-------|-----------|------|
| `user_roles` | INSERT | Add `admin` role for test user |
| `sms_logs` | INSERT | Add 3 failed SMS test entries |

---

## Architecture: Chat Prompt Flow

```text
User clicks prompt button
         |
         v
+------------------------+
| ChatMessageList        |
| onClick={() =>         |
|   onSendPrompt(prompt) |
| }                      |
+----------+-------------+
           |
           v
+----------+-------------+
| Chat.tsx               |
| onSendPrompt={sendMessage}
+----------+-------------+
           |
           v
+----------+-------------+
| useChat hook           |
| sendMessage(prompt)    |
+----------+-------------+
           |
           v
+----------+-------------+
| ai-chat edge function  |
| (Lovable AI Gateway)   |
+------------------------+
```

---

## Security Note

The admin role assignment is for testing only. In production, admin roles should be assigned through a proper administrative process with audit logging.

