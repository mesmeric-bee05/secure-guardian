#!/usr/bin/env node
/**
 * Renders security/findings-report.md and security/REMEDIATION.md from
 * security/snapshots/latest.json + security/allowlist.json.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { SEV, FIX_MAP, normaliseLevel, isAllowlisted as _isAllowlisted, flattenSnapshot } from "./lib/findingMap.mjs";

const ROOT = process.cwd();

const snapshot = JSON.parse(await fs.readFile(path.join(ROOT, "security/snapshots/latest.json"), "utf8"));
const allowlist = JSON.parse(await fs.readFile(path.join(ROOT, "security/allowlist.json"), "utf8"));

function isAllowlisted(f) { return _isAllowlisted(allowlist, f); }

const rows = flattenSnapshot(snapshot);

// ---- findings-report.md ----
const counts = (preds) => SEV.reduce((acc, s) => ({ ...acc, [s]: rows.filter((r) => r.severity === s && preds(r)).length }), {});
const reportLines = [];
reportLines.push(`# Security Findings Report`);
reportLines.push(``);
reportLines.push(`Generated: ${snapshot.generated_at}`);
reportLines.push(``);
reportLines.push(`## Summary`);
reportLines.push(``);
reportLines.push(`| Scanner | Last run | Total | Critical | High | Warn | Info |`);
reportLines.push(`| --- | --- | --- | --- | --- | --- | --- |`);
for (const [scanner, payload] of Object.entries(snapshot.scanners || {})) {
  const rs = rows.filter((r) => r.scanner_name === scanner);
  const c = (s) => rs.filter((r) => r.severity === s).length;
  reportLines.push(`| ${scanner} | ${payload.timestamp} | ${rs.length} | ${c("critical")} | ${c("high")} | ${c("warn")} | ${c("info")} |`);
}
reportLines.push(``);
reportLines.push(`## Findings`);
reportLines.push(``);
if (rows.length === 0) {
  reportLines.push(`No findings across all scanners.`);
} else {
  reportLines.push(`| Scanner | Severity | ID | Name | Status |`);
  reportLines.push(`| --- | --- | --- | --- | --- |`);
  for (const r of rows) {
    const status = isAllowlisted(r) ? "accepted-risk" : "open";
    reportLines.push(`| ${r.scanner_name} | ${r.severity} | ${r.internal_id} | ${r.name.replace(/\|/g, "\\|")} | ${status} |`);
  }
}
reportLines.push(``);
reportLines.push(`## Accepted risks (allowlist)`);
reportLines.push(``);
for (const e of allowlist.entries) {
  reportLines.push(`- **${e.scanner_name}:${e.internal_id}** — ${e.reason}`);
}
reportLines.push(``);
await fs.writeFile(path.join(ROOT, "security/findings-report.md"), reportLines.join("\n"));

// ---- REMEDIATION.md ----
const remLines = [];
remLines.push(`# Security Remediation Tasks`);
remLines.push(``);
remLines.push(`Generated: ${snapshot.generated_at}`);
remLines.push(``);
if (rows.length === 0) {
  remLines.push(`No open findings.`);
} else {
  remLines.push(`| Status | Scanner | Severity | ID | Affected | File | Recommended fix |`);
  remLines.push(`| --- | --- | --- | --- | --- | --- | --- |`);
  for (const r of rows) {
    const mapped = FIX_MAP[r.internal_id] || { file: "(see scanner link)", affected: "(unknown)", fix: r.link || "Review scanner guidance." };
    const status = isAllowlisted(r) ? "accepted-risk" : "open";
    remLines.push(`| ${status} | ${r.scanner_name} | ${r.severity} | ${r.internal_id} | ${mapped.affected} | ${mapped.file} | ${mapped.fix.replace(/\|/g, "\\|")} |`);
  }
}
remLines.push(``);
await fs.writeFile(path.join(ROOT, "security/REMEDIATION.md"), remLines.join("\n"));

console.log(`render-report: wrote findings-report.md + REMEDIATION.md (${rows.length} findings)`);
