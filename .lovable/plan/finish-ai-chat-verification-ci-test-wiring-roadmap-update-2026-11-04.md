# Finish: AI chat verification, CI test wiring, roadmap update

## Current state (verified)
- `tests/e2e/ai-chat.spec.ts` exists and is correct in shape (signs in as admin via `/auth`, asks about burn first aid, asserts a 200 from `/functions/v1/ai-chat` and a real answer on screen, plus a clear-error path for a 429).
- `.github/workflows/security-e2e.yml` runs `bunx playwright test --config=playwright.e2e.config.ts` with **no test filter**, and that config's `testDir` is `tests/e2e` — so `ai-chat.spec.ts`, `mpesa-ops-dashboard.spec.ts`, `audit-logs-mpesa-filters.spec.ts` and `admin-chat-history.spec.ts` are **already picked up automatically**. No workflow edit is needed for the specs themselves.
- The workflow already references the four test-login secrets and `ALERT_SCHEDULER_TOKEN`, and hard-fails with a clear message when secrets are missing.
- The sandbox restart wiped the saved test logins (`/tmp/creds/creds.json` no longer exists) — this is why the chat test can't run yet.

## Steps

1. **Recover the test logins**
   - Recreate `/tmp/creds/creds.json`. If the existing `e2e-admin@medireach.test` / `e2e-user@medireach.test` passwords are unrecoverable, reset both accounts' passwords to fresh known test values via the backend admin API, and re-verify they are onboarded and have the right roles.

2. **Run the AI chat test in the preview and fix what it finds**
   - Run `tests/e2e/ai-chat.spec.ts` locally against the dev server with the recovered logins.
   - Confirm with screenshot evidence that a real streamed answer appears (e.g. burn first aid guidance) instead of a retry/error message.
   - If it fails: diagnose via the browser console/network log and `/tmp/observability` logs, fix the chat hook or `ai-chat` edge function, and re-run until green. Both tests in the spec (happy path + clear 429 error) must pass.
   - Also sanity-check the AI Gateway logs show the request reaching the model.

3. **Confirm CI coverage of all four new specs**
   - Verify by listing the collected tests (dry-run) that the security-e2e workflow would run all four new specs — documenting that the existing no-filter invocation already covers them (no workflow change needed).

4. **GitHub secrets — hand the user the exact list**
   - I cannot set GitHub repository secrets from here. Provide the user the precise list to add in the repo's settings: `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `ALERT_SCHEDULER_TOKEN` (same value as the live alert token). Note the known limitation: the checks also use a service key from Lovable Cloud that isn't exposed, so some steps may degrade on GitHub.

5. **Update `roadmap.md`**
   - Mark completed items (audit-filter tests, alert schedules, M-PESA dashboard, chat CORS repair, callback idempotency tests) done; keep the AI-chat verification and GitHub-secrets items open until finished this turn.

## Out of scope
- The optional KES 1 Daraja test push (needs the user to approve it on their phone).
- No new features; only verification, small fixes, and documentation.
