# MediReach+ completion and verification pass

## Goal
Use the uploaded final-year reports as the acceptance reference, close the known verification gaps, and fix only defects that can be reproduced. Preserve the existing architecture rather than starting a broad rewrite.

## Work
1. **Restore verification prerequisites after plan approval.** Resume Lovable Cloud and confirm it is healthy before authenticated or database checks. Install Playwright Chromium in this sandbox if it is still missing. Check whether the existing test accounts and required credentials are available without exposing or committing passwords.
2. **Verify the AI assistant end to end.** Run the real-answer browser test against the preview, ask first-aid questions in English and Swahili, confirm a successful streamed response appears, and check the corresponding AI request logs. Also verify the clear error state for a simulated failed request. Fix any cause supported by the browser or function logs, then rerun the same checks.
3. **Run report-aligned regression checks.** Execute the existing browser, edge-function, and security suites. Validate the critical user journeys represented in the reports: sign-in and onboarding; bilingual protocols and offline access; AI and voice interaction; emergency facilities, SOS and CHW case/location coordination; push alerts; and admin reports, audit history, USSD/SMS, and M-PESA operations. Add focused coverage only where an important journey lacks a reliable check, and fix reproducible failures.
4. **Confirm operational and CI readiness.** Verify the current scheduled alert/cleanup jobs and existing CI test collection. Check required GitHub secret names without attempting to read secret values; list any missing items as user actions. Use simulated M-PESA outcomes only—do not initiate a real payment or contact real users.
5. **Close the loop.** Update the roadmap with completed checks and any remaining external blockers, then summarize observed results and unverified items.

## Completion criteria
- The authenticated AI chat test runs rather than skips, receives a successful streaming response, and displays a real answer instead of a retry/error message.
- Relevant existing suites complete without unexplained skips or failures; any defect changed is confirmed by rerunning its failing check.
- Report-critical flows receive a current verification result, with any unavailable account access, GitHub secret, or user-triggered payment clearly identified rather than assumed successful.

## Technical details
- Resume Cloud only after plan approval and verify its health before any backend-dependent test.
- Reuse configured test credentials where available; never place passwords, private keys, or service credentials in source files, logs, or chat.
- Avoid schema, secret, or payment changes unless verification proves they are needed; keep simulated test data clearly identified.