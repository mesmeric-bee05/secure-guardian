#!/usr/bin/env node
// Fails CI if any of the pinned "fixed" internal_ids reappear in the latest
// security snapshot. Runs after the main security gate so the two findings
// the team fixed can never regress silently onto main.
import { readFileSync, existsSync } from "node:fs";

const FIXED_IDS = new Set([
  "jwt_sub_unchecked",
  "SUPA_anon_security_definer_function_executable",
]);

const SNAPSHOT = "security/snapshots/latest.json";
if (!existsSync(SNAPSHOT)) {
  console.log(`[regression-check] no snapshot at ${SNAPSHOT}; skipping.`);
  process.exit(0);
}

const snap = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
const regressions = [];
for (const [scanner, payload] of Object.entries(snap.scanners ?? {})) {
  for (const f of payload.findings ?? []) {
    const id = f.internal_id ?? f.id;
    if (FIXED_IDS.has(id)) {
      regressions.push({ scanner, id, name: f.name, level: f.level });
    }
  }
}

if (regressions.length === 0) {
  console.log("[regression-check] OK — no pinned findings present.");
  process.exit(0);
}

console.error("::error::Security regression detected for pinned internal_ids:");
for (const r of regressions) {
  console.error(`::error::REGRESSION: ${r.scanner} :: ${r.id} :: ${r.name} (${r.level})`);
}
console.error(
  "\nThese findings were previously fixed and must not reappear. " +
  "Fix the underlying issue before merging, or update the pin list in " +
  "scripts/security-regression-check.mjs after explicit review.",
);
process.exit(1);
