# Implementation roadmap

- [x] Add Playwright coverage for M-PESA audit filters.
- [x] Harden and verify denial-spike alerting; install secure schedules (5-minute spike check, 02:00 UTC nightly ledger purge).
- [x] Build the admin M-PESA operations dashboard (pending donations, callback ledger, denied attempts, USSD bursts, Simulated badges) with e2e tests.
- [x] Repair AI chat CORS, gateway handling, browser errors; e2e coverage written.
- [x] Verify callback idempotency/replay behavior and focused test suites.
- [ ] Verify the AI chat e2e spec returns a real streamed answer in the preview (blocked earlier by unavailable test logins).
- [ ] Add the four test-login secrets (TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_USER_EMAIL, TEST_USER_PASSWORD) plus ALERT_SCHEDULER_TOKEN to the GitHub repository secrets — user action in GitHub settings.
