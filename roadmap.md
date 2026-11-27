# Implementation roadmap

- [x] Add Playwright coverage for M-PESA audit filters.
- [x] Harden and verify denial-spike alerting; install secure schedules (5-minute spike check, 02:00 UTC nightly ledger purge).
- [x] Build the admin M-PESA operations dashboard (pending donations, callback ledger, denied attempts, USSD bursts, Simulated badges) with e2e tests.
- [x] Repair AI chat CORS, gateway handling, browser errors; e2e coverage written.
- [x] Verify callback idempotency/replay behavior and focused test suites.
- [ ] Resume Lovable Cloud and confirm it is healthy before live verification (approved by the user; pending execution).
- [ ] Install Playwright Chromium if needed, then verify authenticated English and Swahili AI answers stream successfully in the preview.
- [ ] Run report-aligned regression suites across onboarding, protocols/offline access, emergency/CHW workflows, push, admin reporting, USSD/SMS, and M-PESA; fix confirmed failures.
- [ ] Verify existing scheduled jobs and CI secret requirements without exposing secret values; list any missing GitHub secrets as user actions.
- [ ] Update this roadmap with verified outcomes and remaining external blockers.
