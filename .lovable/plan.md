# Real M-PESA traffic, Ops view fixes and tests, chat check, admin chat history

## 1. Fix the success count on M-PESA Ops
- Payments are saved as "success", but the view counts and colours rows marked "completed". Change the view to read "success" so its count matches the ledger. Payment saving stays as it is.
- Also add the two items still missing:
  - a "Simulated" badge on test rows
  - a USSD burst card that counts rate-limit events in the selected time window

## 2. Real Safaricom Daraja traffic
- The callback endpoint and ledger already exist. Real payments also need your Daraja account keys: consumer key, consumer secret, shortcode and passkey, plus the sandbox or live setting. None of these are saved yet, so I will ask you for them securely.
- Once they are saved:
  - The "Send STK push" button in M-PESA Config sends a real prompt to a phone.
  - Safaricom's reply arrives at the signed callback and fills the ledger, the pending donations and the denied attempts.
- Check: start one sandbox STK push, then confirm a ledger row appears without the "simulated" tag.
- Until the keys are saved, this step waits on you and is reported as blocked. It will not be faked.

## 3. Browser tests for the M-PESA Ops view, run in CI
- New test `tests/e2e/mpesa-ops-dashboard.spec.ts` checks:
  - the pending, success, denied and duplicate cards match the rows in the tables
  - the time-window, reason and donation-ID filters narrow the rows
  - a duplicate callback appears in both the ledger and the denied table
  - simulated rows show their badge
  - a non-admin user is refused
- New test `tests/e2e/audit-logs-mpesa-filters.spec.ts` checks the audit-log filters against the simulated rows.
- Add both tests to the security CI workflow. Run them locally and fix any mismatches they find.

## 4. Confirm the AI chat gives a real answer
- Sign in to the preview and ask a real first-aid question.
- Confirm a streamed answer appears, and confirm the request shows up in the AI request logs.
- If the request fails, fix the cause first. Possible causes are the model name, the origin rules or the sign-in headers.
- Add a chat test that covers a successful answer and the error message shown on failure.

## 5. Chat history panel in the admin area
- Messages are already saved for each conversation. Add an admin-only read rule so admins can view every conversation.
- New "Chat History" admin tab:
  - a list of conversations with a search box (title or message text), language and date filters
  - click a conversation to read its full thread
- Each time an admin opens a conversation, it is recorded in the audit log, because these messages are health data.

## Technical notes
- Database change: add admin SELECT policies on chat_sessions and chat_messages using `has_role(auth.uid(),'admin')`, as permissive policies. Search uses `ilike` on message content, limited to 50 results per page.
- Opening a conversation calls the existing `log_admin_action` function with the action `chat_session_viewed`.
- New secrets: MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_ENV.
- The roadmap is updated at the end. Anything still blocked is named, along with its blocker.
