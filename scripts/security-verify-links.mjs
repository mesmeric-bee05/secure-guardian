#!/usr/bin/env node
/**
 * Verifies that every FIX_MAP entry — and every row in security/REMEDIATION.md —
 * points to a real file and a real symbol (function/table) when applicable.
 *
 * Exits non-zero with a printed list of broken links.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { FIX_MAP } from "./lib/findingMap.mjs";

const ROOT = process.cwd();
const errors = [];

async function fileExists(p) {
  try { await fs.access(path.join(ROOT, p)); return true; } catch { return false; }
}

function parseAffected(affected) {
  return String(affected || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^public\.[a-zA-Z_][\w]*$/.test(s))
    .map((s) => s.slice("public.".length));
}

async function verifyEntry(id, entry, source) {
  if (entry.file.startsWith("pseudo:")) return;
  if (!(await fileExists(entry.file))) {
    errors.push(`[${source}] ${id}: file not found -> ${entry.file}`);
    return;
  }
  const content = await fs.readFile(path.join(ROOT, entry.file), "utf8");
  const symbols = parseAffected(entry.affected);
  for (const sym of symbols) {
    if (!content.includes(sym)) {
      errors.push(`[${source}] ${id}: symbol "public.${sym}" not found in ${entry.file}`);
    }
  }
  // For SQL migrations, require a definition for each symbol.
  if (entry.file.endsWith(".sql")) {
    for (const sym of symbols) {
      const fnRe = new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${sym}\\b`, "i");
      const tblRe = new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?public\\.${sym}\\b`, "i");
      const viewRe = new RegExp(`create\\s+(or\\s+replace\\s+)?view\\s+public\\.${sym}\\b`, "i");
      if (!fnRe.test(content) && !tblRe.test(content) && !viewRe.test(content)) {
        errors.push(`[${source}] ${id}: no CREATE FUNCTION/TABLE/VIEW for public.${sym} in ${entry.file}`);
      }
    }
  }
}

// 1) FIX_MAP entries
for (const [id, entry] of Object.entries(FIX_MAP)) {
  await verifyEntry(id, entry, "FIX_MAP");
}

// 2) REMEDIATION.md rows (sanity check render-report output is in sync)
try {
  const md = await fs.readFile(path.join(ROOT, "security/REMEDIATION.md"), "utf8");
  const lines = md.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Status") && !l.startsWith("| ---"));
  for (const line of lines) {
    const cells = line.split("|").map((c) => c.trim());
    // | status | scanner | severity | id | affected | file | fix |
    if (cells.length < 8) continue;
    const id = cells[4];
    const affected = cells[5];
    const file = cells[6];
    if (!id || file === "(see scanner link)") continue;
    await verifyEntry(id, { file, affected, line: null }, "REMEDIATION.md");
  }
} catch {
  // remediation file optional in early runs
}

if (errors.length) {
  console.error("security-verify-links: FAIL");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("security-verify-links: OK — all FIX_MAP + REMEDIATION links resolve.");
