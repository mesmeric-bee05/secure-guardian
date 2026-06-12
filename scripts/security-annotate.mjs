#!/usr/bin/env node
/**
 * Emits GitHub Actions workflow commands (annotations) and a step summary
 * for findings in security/snapshots/latest.json.
 *
 * - Non-allowlisted findings >= SEVERITY_THRESHOLD => ::error annotation.
 * - Allowlisted findings                            => ::warning annotation.
 *
 * Annotations appear inline on the PR Files-changed view when `file` is real.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { SEV, flattenSnapshot, isAllowlisted, mapFor } from "./lib/findingMap.mjs";

const ROOT = process.cwd();
const threshold = (process.env.SEVERITY_THRESHOLD || "high").toLowerCase();
const thresholdIdx = Math.max(0, SEV.indexOf(threshold));

const snapshotPath = process.env.SNAPSHOT_PATH || path.join(ROOT, "security/snapshots/latest.json");
const allowlistPath = path.join(ROOT, "security/allowlist.json");

async function readJson(p, fallback) {
  try { return JSON.parse(await fs.readFile(p, "utf8")); }
  catch { return fallback; }
}

const snapshot = await readJson(snapshotPath, { scanners: {} });
const allowlist = await readJson(allowlistPath, { entries: [] });
const rows = flattenSnapshot(snapshot);

function esc(s) {
  return String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

const blocking = [];
const accepted = [];
for (const r of rows) {
  const m = mapFor(r.internal_id);
  const isPseudo = m.file.startsWith("pseudo:");
  const fileArg = isPseudo ? "" : `file=${m.file}${m.line ? `,line=${m.line}` : ""},`;
  const title = `${r.scanner_name}:${r.internal_id}`;
  const msg = `${r.name} — affected: ${m.affected} — fix: ${m.fix}`;
  if (isAllowlisted(allowlist, r)) {
    accepted.push(r);
    console.log(`::warning ${fileArg}title=${esc(title)}::${esc(msg)} [accepted-risk]`);
  } else if (SEV.indexOf(r.severity) >= thresholdIdx) {
    blocking.push(r);
    console.log(`::error ${fileArg}title=${esc(title)}::${esc(msg)}`);
  } else {
    console.log(`::notice ${fileArg}title=${esc(title)}::${esc(msg)}`);
  }
}

// Step summary
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  const lines = [];
  lines.push(`## Security findings (threshold ≥ \`${threshold}\`)`);
  lines.push("");
  lines.push(`- Blocking: **${blocking.length}**`);
  lines.push(`- Accepted (allowlisted): ${accepted.length}`);
  lines.push("");
  if (blocking.length) {
    lines.push(`### Blocking`);
    lines.push(`| Scanner | Severity | ID | File | Affected |`);
    lines.push(`| --- | --- | --- | --- | --- |`);
    for (const r of blocking) {
      const m = mapFor(r.internal_id);
      lines.push(`| ${r.scanner_name} | ${r.severity} | ${r.internal_id} | ${m.file} | ${m.affected} |`);
    }
    lines.push("");
  }
  try {
    const report = await fs.readFile(path.join(ROOT, "security/findings-report.md"), "utf8");
    lines.push(`<details><summary>Full findings report</summary>\n\n${report}\n\n</details>`);
  } catch { /* report optional */ }
  await fs.appendFile(summaryPath, lines.join("\n") + "\n");
}

console.error(`security-annotate: ${blocking.length} blocking, ${accepted.length} accepted-risk.`);
