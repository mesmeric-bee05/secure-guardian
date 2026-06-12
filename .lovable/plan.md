
# Plan — Phase 4: Security CI/Issue Automation + Link Integrity

Builds on the existing `scripts/security-{gate,ingest,render}.mjs` + `security/snapshots/latest.json` + `security/REMEDIATION.md` infra. No product/runtime code is touched.

## 1. CI annotations on PRs (`scripts/security-annotate.mjs`)
- New Node script that reads `security/snapshots/latest.json` + `security/allowlist.json` and the same `FIX_MAP` used by `render-report.mjs` (extract to `scripts/lib/findingMap.mjs` so both scripts share it).
- For each non-allowlisted finding ≥ threshold, emit a GitHub workflow command:
  ```
  ::error file=<file>,line=<line>,title=<scanner:internal_id>::<name> — affected: <affected>
  ```
  When `FIX_MAP` doesn't have a line, omit `line=`. Allowlisted findings emit `::warning` instead.
- Wire into `.github/workflows/security-gate.yml` as a step that runs after `render-report` and before `security-gate.mjs`, so annotations appear inline on the PR Files-changed view regardless of gate outcome.
- Also write a Markdown step-summary (`$GITHUB_STEP_SUMMARY`) containing the rendered `security/findings-report.md` + a "Blocking" table for at-a-glance PR review.

## 2. Auto-open GitHub issues per remediation task (`scripts/security-open-issues.mjs` + `.github/workflows/security-issues.yml`)
- Script reads snapshot + allowlist + `FIX_MAP`. For each non-allowlisted finding:
  - Title: `[security] <scanner>:<internal_id> — <name>`
  - Body: severity, scanner, created_at, affected object, file link (`https://github.com/${GITHUB_REPOSITORY}/blob/${GITHUB_SHA}/<file>`), recommended fix, scanner link, owner (from allowlist or default `platform-security`).
  - Labels: `security`, `severity:<level>`, `scanner:<name>`.
  - Idempotency key: hidden HTML comment `<!-- security-finding-id: <scanner>:<internal_id> -->`. Script lists open + closed issues with label `security`, matches on the marker, and skips/updates instead of creating duplicates. Closes issues whose finding is no longer present or is now allowlisted (comment + close).
- Uses `gh` CLI (preinstalled on `ubuntu-latest`) with `GITHUB_TOKEN` (no extra secret needed).
- Workflow triggers: `workflow_dispatch` + after the nightly scan workflow succeeds + on push to `main` when `security/snapshots/latest.json` changes.

## 3. Nightly scan + consolidated report artifact (`.github/workflows/security-nightly.yml`)
- Cron: `0 3 * * *` (UTC) + `workflow_dispatch`.
- Steps:
  1. Checkout, setup-node 20.
  2. `node scripts/scan-secrets.mjs` (existing).
  3. `npm run security:ingest -- security/raw-scan.json` — for now we re-ingest the committed `security/raw-scan.json`; add a `SCAN_INPUT` env so a future provider-side hook can drop fresh Wiz/`connector_security_scan` JSON at `security/raw-scan.json` before this step. Document the contract in `security/README.md`.
  4. `npm run security:render`.
  5. Upload `security/findings-report.md`, `security/REMEDIATION.md`, `security/snapshots/*.json` as artifact `security-nightly-<run_id>`.
  6. If `git diff` shows changes under `security/snapshots/` or `security/*.md`, open a PR via `peter-evans/create-pull-request@v6` titled `chore(security): nightly snapshot <date>` so changes are reviewable (no direct push to `main`).
  7. Trigger `security-issues.yml` via `workflow_run` so issues stay in sync.

## 4. Remediation link-integrity tests (`scripts/security-verify-links.mjs` + Vitest)
- New script + a Vitest spec `scripts/__tests__/security-links.test.mjs`:
  - Parses `security/REMEDIATION.md` and the shared `FIX_MAP`.
  - For every row, verifies:
    - `file` exists on disk (skip pseudo-paths like `supabase (extension)` — flagged via a `pseudo:` prefix in `FIX_MAP`).
    - For `affected` entries shaped `public.<fn>` / `public.<table>`: ripgrep the file for the symbol name; fail if not found.
    - For migration SQL files: also assert `CREATE OR REPLACE FUNCTION public.<fn>` (functions) or `CREATE TABLE public.<table>` (tables) appears.
  - Test fails on any miss with the offending row printed.
- Add `vitest` config entry (already in repo) — task runs in CI via existing test workflow and locally with `bunx vitest run scripts/__tests__/security-links.test.mjs`.
- Add `.github/workflows/security-links.yml` (PRs touching `supabase/migrations/**`, `supabase/functions/**`, `security/**`, `scripts/lib/findingMap.mjs`) that runs only this spec for fast feedback.

## 5. Shared module + housekeeping
- Extract `FIX_MAP` + severity helpers from `scripts/render-report.mjs` into `scripts/lib/findingMap.mjs`. Update `render-report.mjs`, `security-annotate.mjs`, `security-open-issues.mjs`, `security-verify-links.mjs` to import it.
- Add `npm run` aliases: `security:annotate`, `security:issues`, `security:verify-links`.
- `security/README.md`: document the snapshot file contract, allowlist format, and where to drop Wiz/connector raw output for nightly ingestion.

## File-level summary

```text
scripts/
  lib/findingMap.mjs                NEW shared FIX_MAP + severity utils
  security-annotate.mjs             NEW PR annotations + step summary
  security-open-issues.mjs          NEW idempotent gh issue sync
  security-verify-links.mjs         NEW link/function/table validator
  __tests__/security-links.test.mjs NEW vitest spec
  render-report.mjs                 EDIT import shared map
.github/workflows/
  security-gate.yml                 EDIT add annotate step + step summary
  security-nightly.yml              NEW cron + artifact + PR
  security-issues.yml               NEW gh issue sync
  security-links.yml                NEW link-integrity check
security/README.md                  NEW contract docs
package.json                        EDIT new scripts
```

## Out of scope
- No changes to app runtime, RLS, migrations, or edge functions.
- No new external services or secrets (uses default `GITHUB_TOKEN`).
- Real Wiz/`connector_security_scan` API ingestion is stubbed via the existing `security/raw-scan.json` drop point — wiring an actual provider webhook is a follow-up once credentials/endpoint are decided.

Reply "go" to implement, or tell me what to adjust (e.g. different cron, push-instead-of-PR for nightly, additional labels).
