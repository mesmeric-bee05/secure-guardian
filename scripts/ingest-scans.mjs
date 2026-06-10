#!/usr/bin/env node
/**
 * Normalises raw scanner output into security/snapshots/latest.json
 * and timestamped per-scanner files.
 *
 * Input: stdin JSON shaped like the `security--get_scan_results` tool result.
 * Usage:
 *   cat raw-scan.json | node scripts/ingest-scans.mjs
 *   node scripts/ingest-scans.mjs path/to/raw-scan.json
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "security/snapshots");

async function readInput() {
  if (process.argv[2]) return await fs.readFile(process.argv[2], "utf8");
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  if (!chunks.length) return null;
  return Buffer.concat(chunks).toString("utf8");
}

const raw = await readInput();
if (!raw) {
  console.error("ingest-scans: no input. Pipe scanner JSON via stdin or pass a file path.");
  process.exit(2);
}
const parsed = JSON.parse(raw);

await fs.mkdir(OUT_DIR, { recursive: true });
const generatedAt = new Date().toISOString();

const normalised = { generated_at: generatedAt, scanners: {} };
for (const [name, body] of Object.entries(parsed || {})) {
  const findings = Array.isArray(body?.findings) ? body.findings : [];
  normalised.scanners[name] = {
    scanner_name: name,
    timestamp: body?.timestamp || generatedAt,
    up_to_date: body?.up_to_date ?? null,
    findings,
  };
  const tag = generatedAt.replace(/[:.]/g, "-");
  await fs.writeFile(
    path.join(OUT_DIR, `${name}-${tag}.json`),
    JSON.stringify(normalised.scanners[name], null, 2),
  );
}

await fs.writeFile(
  path.join(OUT_DIR, "latest.json"),
  JSON.stringify(normalised, null, 2),
);

console.log(`ingest-scans: wrote ${Object.keys(normalised.scanners).length} scanner snapshot(s) at ${generatedAt}`);
