#!/usr/bin/env node
/**
 * Renders security/findings-report.md and security/REMEDIATION.md from
 * security/snapshots/latest.json + security/allowlist.json.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SEV = ["info", "warn", "high", "critical"];

function normaliseLevel(level) {
  const l = String(level || "warn").toLowerCase();
  if (l === "error") return "high";
  if (l === "low") return "info";
  if (l === "medium" || l === "moderate") return "warn";
  if (SEV.includes(l)) return l;
  return "warn";
}

const FIX_MAP = {
  "SUPA_authenticated_security_definer_function_executable": {
    file: "supabase/migrations/20260510103858_bbd68668-925c-4856-a196-32e3556550c7.sql",
    affected: "public.has_role, public.is_admin, public.is_chw, public.log_admin_action, public.admin_run_security_events_purge, public.security_events_summary, public.security_events_retention_status, public.security_top_ips",
    fix: "Accepted: RLS helpers need authenticated EXECUTE; admin RPCs gate via is_admin(auth.uid()).",
  },
  "SUPA_extension_in_public": {
    file: "supabase (extension)",
    affected: "extension public.pg_net",
    fix: "Accepted: required in public for managed pg_cron jobs.",
  },
};

const snapshot = JSON.parse(await fs.readFile(path.join(ROOT, "security/snapshots/latest.json"), "utf8"));
const allowlist = JSON.parse(await fs.readFile(path.join(ROOT, "security/allowlist.json"), "utf8"));

function isAllowlisted(f) {
  return allowlist.entries.some((e) =>
    e.scanner_name === f.scanner_name && e.internal_id === f.internal_id
    && (!e.expires_at || new Date(e.expires_at).getTime() >= Date.now())
  );
}

const rows = [];
for (const [scanner, payload] of Object.entries(snapshot.scanners || {})) {
  for (const raw of payload.findings || []) {
    rows.push({
      scanner_name: scanner,
      internal_id: raw.internal_id || raw.id,
      name: raw.name || raw.id,
      severity: normaliseLevel(raw.level || raw.severity),
      created_at: raw.created_at || payload.timestamp,
      link: raw.link || "",
    });
  }
}

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
