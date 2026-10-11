# Real Daraja keys, Ops/USSD/chat-history tests, and a real AI chat check

Every step finishes with a real check: a deploy result, a database query, a test run, or a browser screenshot. Anything blocked gets reported with its reason.

## 1. Daraja keys (you enter them, I never see them)
- Open a secure form for MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY and MPESA_ENV (sandbox or production). Values you've already saved are skipped. MPESA_CALLBACK_URL is set to the deployed callback address if it isn't set yet.
- Redeploy the STK push, callback and config-check functions.
- Check: the M-PESA Config tab shows every item green and the live Daraja probe succeeds. A KES 1 test push from that tab creates a pending donation. Once you approve it on your phone, the callback writes a ledger row, which shows on the Ops view without a Simulated badge.

## 2. Test logins and preview sign-in
- Ask you to choose how to get an admin account in the app. You can sign up in the preview yourself and I grant that account admin, or I create dedicated test accounts.
- Store TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_USER_EMAIL and TEST_USER_PASSWORD as secrets and as CI secrets. I'll list which CI secrets you need to add in GitHub.

## 3. USSD burst card
- The card on the M-PESA Ops view counts rate-limit (blocked burst) events from security events in the selected 24h/7d/30d window. It has loading, empty and error states, plus test IDs.
- Browser test: seed tagged rate-limit events, then check that the count changes with the time window.

## 4. Browser tests run with real logins
- Run these specs locally with the real admin and user logins: `mpesa-ops-dashboard.spec.ts` (cards, ledger, denials, filters, Simulated badge, USSD card, non-admin blocked) and `audit-logs-mpesa-filters.spec.ts`. Fix any mismatches they find.
- New `admin-chat-history.spec.ts`: send two chat messages in two conversations, confirm each is stored, and confirm that searching by conversation shows only that conversation's messages. A non-admin is denied.
- Add all three specs to the security e2e workflow, with the no-skip check enabled.

## 5. Real AI chat answer
- Sign in to the preview as the admin, ask a real health question and screenshot the streamed answer. Confirm the request appears in the AI request logs and no retry message shows.
- Add a Playwright chat test for a successful answer and for the error message shown on failure.

## 6. Roadmap
- Update the roadmap with each finished task, and name any open task with its blocker.

## Technical notes
- Secrets are requested only through the secure form. Their values are never logged or shown.
- Simulated rows keep `simulated: true` plus a run ID. Real Daraja traffic is never tagged.
