# Phase 3 — Security Reporting, CI Gate & SEO Pass

This phase wires the security scanners into CI, produces a consolidated findings report (including Wiz / `connector_security_scan`), and finishes the SEO baseline. No product features change.

## What you'll see when it ships
- A new `.github/workflows/security-gate.yml` that fails the build when scanner findings exceed a configured severity (default: `high`).
- `security/REMEDIATION.md` — one row per current finding with file, function, table, and owner.
- `security/findings-report.md` — consolidated, timestamped snapshot of every scanner (Supabase, Supabase-Lov, agent_security, connector_security_scan/Wiz).
- SEO baseline applied to `index.html` + `public/robots.txt` + `public/sitemap.xml` (title, description, canonical, OG/Twitter, JSON-LD).
- `mem://security/standards-hardening` refreshed with Wiz/connector scan provenance (timestamps + source tool + affected objects).

## Plan

### 1. CI security gate
- Add `scripts/security-gate.mjs`. Inputs:
  - `SEVERITY_THRESHOLD` env (`info|warn|high|critical`, default `high`).
  - `security/findings.json` produced by a fetch step (Supabase linter + cached scanner snapshot committed to repo under `security/snapshots/`).
- Exit 1 when any finding ≥ threshold is not present in `security/allowlist.json` (keyed by `scanner_name + internal_id`, with `reason` + `expires_at`).
- New workflow `.github/workflows/security-gate.yml`:
  - Runs on PR + push to `main`.
  - Steps: checkout → `node scripts/security-gate.mjs` → upload `security/findings-report.md` as artifact.
- Extend existing `.github/workflows/security.yml` to also call `scripts/security-gate.mjs` after the secret scan so a single workflow enforces both.

### 2. Remediation task list
- Generate `security/REMEDIATION.md` from `security/findings.json`. For each finding row:
  - `id`, `scanner`, `severity`, `created_at`
  - `affected_object` (table / function / file / edge function)
  - `file` link (e.g. `supabase/migrations/...sql#Lxx` or `supabase/functions/<name>/index.ts`)
  - `recommended_fix` (1 line)
  - `status` (`open` / `accepted-risk` / `fixed`)
- For the two current Supabase findings (already accepted-risk), pre-populate rows pointing to `pg_net` extension + the 8 RLS-helper / admin SECURITY DEFINER functions.

### 3. Wiz / connector_security_scan ingestion
- `scripts/ingest-scans.mjs` reads `tool-results://security--get_scan_results` style JSON (or a committed snapshot) and writes:
  - `security/snapshots/<scanner>-<timestamp>.json`
  - Appends a normalized block to `mem://security/standards-hardening` via the memory file: `Source: <scanner_name>`, `Run at: <iso>`, `Affected objects: [...]`, `Severity: ...`, `Status: open|accepted`.
- For empty scanners (Wiz/agent_security/supabase_lov today) the script writes a "no findings as of <ts>" line so the audit trail is explicit.

### 4. Consolidated findings report
- `security/findings-report.md` produced by `scripts/render-report.mjs`:
  - Header: project, generated-at, severity threshold, gate status.
  - Per-scanner section: counts by severity, table of findings with links into REMEDIATION.md.
  - Footer: accepted-risk list pulled from `security/allowlist.json`.
- Wired into the CI workflow as a build artifact + committed snapshot when run on `main`.

### 5. Re-run scans
- Document a one-line command for humans (`npm run security:scan`) that:
  - Invokes the platform `run_security_scan` tool via a thin Node wrapper (best-effort; falls back to the committed snapshot in offline CI).
  - Re-renders the consolidated report.
- The next agent action after this phase ships will be to call `security--run_security_scan` so the live scanners refresh; the script then re-renders the report from the new snapshot.

### 6. SEO baseline
- `index.html`:
  - `<title>MediReach+ — Emergency & Health AI for Tanzania</title>` (≤60 chars)
  - `<meta name="description">` (≤160 chars, bilingual hint)
  - `<link rel="canonical" href="/">`
  - OpenGraph + Twitter tags (no image until asset exists)
  - JSON-LD `MedicalWebPage` + `Organization` blocks
  - Single H1 verified on `src/pages/Index.tsx`
- `public/robots.txt`: allow all, no sitemap line until custom domain confirmed.
- `public/sitemap.xml`: keep relative-URL placeholder with TODO.
- Run the SEO scanner after the file changes and mark fixed findings via `seo--update_findings`.

### 7. Errors & polish (only what scanners actually surface)
- Re-run `supabase--linter` and address anything new the previous phases introduced.
- Address any `tsc`/build errors that surface from the new scripts (scripts are ESM, no project type changes).

## Technical Details

### File map
```text
.github/workflows/security-gate.yml      (new)
.github/workflows/security.yml           (edit — chain gate after secret-scan)
scripts/security-gate.mjs                (new)
scripts/ingest-scans.mjs                 (new)
scripts/render-report.mjs                (new)
security/allowlist.json                  (new — seeded with the 2 accepted findings)
security/snapshots/.gitkeep              (new)
security/REMEDIATION.md                  (generated, committed)
security/findings-report.md              (generated, committed)
index.html                               (edit — SEO head)
public/robots.txt                        (verify)
public/sitemap.xml                       (verify)
```

### Severity model
`info < warn < high < critical`. Threshold env compares numerically. Allowlist entries require `reason` and optional `expires_at` (ISO); expired entries no longer suppress the gate.

### Memory write
Append-only block to `mem://security/standards-hardening` per scan ingest. Index entry stays as-is.

### Out of scope
- No product/feature changes, no schema migrations, no edge function logic changes.
- No new external services or secrets.

Reply "go" to execute, or tell me what to adjust.
