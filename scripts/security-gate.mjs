#!/usr/bin/env node
/**
 * CI security gate.
 *
 * Reads the latest scanner snapshot from security/snapshots/latest.json
 * (produced by scripts/ingest-scans.mjs) and exits non-zero when any
 * finding's severity >= SEVERITY_THRESHOLD and is NOT covered by
 * security/allowlist.json.
 *
 * Env:
 *   SEVERITY_THRESHOLD = info|warn|high|critical  (default: high)
 *   SNAPSHOT_PATH      = override path to findings json
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SEV = ["info", "warn", "high", "critical"];
const threshold = (process.env.SEVERITY_THRESHOLD || "high").toLowerCase();
if (!SEV.includes(threshold)) {
  console.error(`Invalid SEVERITY_THRESHOLD=${threshold}. Expected one of ${SEV.join(",")}`);
  process.exit(2);
}
const thresholdIdx = SEV.indexOf(threshold);

const snapshotPath = process.env.SNAPSHOT_PATH
  || path.join(ROOT, "security/snapshots/latest.json");
const allowlistPath = path.join(ROOT, "security/allowlist.json");

async function readJson(p, fallback) {
  try { return JSON.parse(await fs.readFile(p, "utf8")); }
  catch (e) { if (fallback !== undefined) return fallback; throw e; }
}

function normaliseLevel(level) {
  const l = String(level || "warn").toLowerCase();
  if (l === "error") return "high";
  if (l === "low") return "info";
  if (l === "medium" || l === "moderate") return "warn";
  if (SEV.includes(l)) return l;
  return "warn";
}

function isAllowlisted(entry, finding) {
  if (entry.scanner_name !== finding.scanner_name) return false;
  if (entry.internal_id !== finding.internal_id) return false;
  if (entry.expires_at && new Date(entry.expires_at).getTime() < Date.now()) return false;
  return true;
}

const snapshot = await readJson(snapshotPath, { scanners: {} });
const allowlist = await readJson(allowlistPath, { entries: [] });

const blocking = [];
const accepted = [];
for (const [scanner, payload] of Object.entries(snapshot.scanners || {})) {
  for (const raw of payload.findings || []) {
    const finding = {
      scanner_name: scanner,
      internal_id: raw.internal_id || raw.id,
      name: raw.name || raw.id,
      severity: normaliseLevel(raw.level || raw.severity),
      created_at: raw.created_at || payload.timestamp,
    };
    if (SEV.indexOf(finding.severity) < thresholdIdx) continue;
    if (allowlist.entries.some((e) => isAllowlisted(e, finding))) {
      accepted.push(finding); continue;
    }
    blocking.push(finding);
  }
}

const line = (f) => `  - [${f.severity.toUpperCase()}] ${f.scanner_name}:${f.internal_id} — ${f.name}`;
console.log(`Security gate — threshold ≥ ${threshold}`);
console.log(`Snapshot: ${path.relative(ROOT, snapshotPath)}`);
console.log(`Accepted (allowlisted): ${accepted.length}`);
accepted.forEach((f) => console.log(line(f)));
console.log(`Blocking: ${blocking.length}`);
blocking.forEach((f) => console.log(line(f)));

if (blocking.length > 0) {
  console.error(`\n❌ security-gate: ${blocking.length} finding(s) ≥ ${threshold} not allowlisted.`);
  process.exit(1);
}
console.log("✅ security-gate: clean");
