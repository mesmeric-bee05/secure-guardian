# Security infrastructure

This directory holds the security findings pipeline.

## Files

- `allowlist.json` — accepted risks keyed by `(scanner_name, internal_id)` with `reason`, `expires_at`, `owner`.
- `raw-scan.json` — last raw scanner payload (input to ingest).
- `snapshots/latest.json` — normalised aggregate of all scanner snapshots (input to gate/report/issues).
- `snapshots/<scanner>-<timestamp>.json` — per-scanner historical snapshots.
- `findings-report.md` / `REMEDIATION.md` — generated; do not edit by hand.

## Pipelines

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `security.yml` | PR + push | Secret scan + build sanity. |
| `security-gate.yml` | PR + push | Renders report, emits PR annotations + step summary, blocks merge when blocking findings exceed threshold. |
| `security-links.yml` | PR (security/migrations/functions paths) | Runs `security-verify-links` Node test — fails if remediation rows point to missing files/symbols. |
| `security-nightly.yml` | Cron `0 3 * * *` UTC + manual | Re-runs scan ingest, renders consolidated report, uploads artifact, opens PR with snapshot diff, syncs issues. |
| `security-issues.yml` | Push to `main` touching snapshot/allowlist + manual | Idempotently opens/updates/closes GitHub issues per finding. |

## Adding a new scanner / finding

1. Drop the raw scanner JSON into `security/raw-scan.json` (or set `SCAN_INPUT` env to a different path).
2. `npm run security:ingest -- security/raw-scan.json`
3. Add a `FIX_MAP` entry in `scripts/lib/findingMap.mjs` pointing to the exact file + affected `public.*` symbols.
4. `npm run security:render && npm run security:verify-links`
5. (Optional) Add an `allowlist.json` entry with `reason` if the finding is accepted-risk.

## Severity threshold

`SECURITY_GATE_THRESHOLD` repo/org variable controls the gate. Default `high`. Valid values: `info|warn|high|critical`.
