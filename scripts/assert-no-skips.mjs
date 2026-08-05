#!/usr/bin/env node
// CI guard: fail the build when the security e2e suite silently skipped tests
// (usually because TEST_USER_* / TEST_ADMIN_* / SUPABASE_SERVICE_ROLE_KEY were
// missing) or when zero tests ran at all.
//
// Usage: node scripts/assert-no-skips.mjs <playwright-json-report>
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? "playwright-results.json";

let report;
try {
  report = JSON.parse(readFileSync(file, "utf8"));
} catch (err) {
  console.error(`✖ could not read Playwright JSON report at ${file}: ${err.message}`);
  process.exit(1);
}

const skipped = [];
let total = 0;

function walkSuite(suite, trail = []) {
  const path = [...trail, suite.title].filter(Boolean);
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      total += 1;
      const statuses = (t.results ?? []).map((r) => r.status);
      if (t.status === "skipped" || statuses.every((s) => s === "skipped")) {
        skipped.push([...path, spec.title].join(" › "));
      }
    }
  }
  for (const child of suite.suites ?? []) walkSuite(child, path);
}

for (const suite of report.suites ?? []) walkSuite(suite);

if (total === 0) {
  console.error("✖ no tests were executed — the security e2e suite must run in CI");
  process.exit(1);
}

if (skipped.length > 0) {
  console.error(`✖ ${skipped.length}/${total} security e2e tests were SKIPPED:`);
  for (const name of skipped) console.error(`   - ${name}`);
  console.error(
    "\nSkips in CI almost always mean TEST_USER_EMAIL/TEST_USER_PASSWORD, " +
      "TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD or SUPABASE_SERVICE_ROLE_KEY are not configured. " +
      "Configure the repository secrets and re-run.",
  );
  process.exit(1);
}

console.log(`✓ ${total} security e2e tests ran, none skipped`);
