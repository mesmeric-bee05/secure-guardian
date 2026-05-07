#!/usr/bin/env node
/**
 * scripts/scan-secrets.mjs
 * Blocks commits/CI if forbidden server-only secrets or key shapes appear in
 * the client-side source (`src/`, `index.html`, `public/`) or in the built
 * client bundle (`dist/`).
 *
 * Run: node scripts/scan-secrets.mjs                # source scan
 *      node scripts/scan-secrets.mjs --bundle       # also scan dist/
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SCAN_BUNDLE = process.argv.includes("--bundle");

const SOURCE_DIRS = ["src", "public"];
const SOURCE_FILES = ["index.html"];
const BUNDLE_DIRS = ["dist"];

// Forbidden secret-name references (env keys that must NEVER end up client-side)
const FORBIDDEN_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEYS",
  "SUPABASE_JWKS",
  "LOVABLE_API_KEY",
  "AFRICAS_TALKING_API_KEY",
  "AFRICAS_TALKING_USERNAME",
  "VAPID_PRIVATE_KEY",
  "STRIPE_SECRET_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
];

// High-confidence value-shape patterns
const FORBIDDEN_PATTERNS = [
  // Generic JWT (Supabase legacy service role / anon old format are both JWTs;
  // we additionally check for the `service_role` claim chunk)
  { name: "service_role JWT", re: /eyJhbGciOi[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]+service_role[A-Za-z0-9_\-.]+/ },
  // Supabase secret API key (sb_secret_…)
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_\-]{16,}\b/ },
  // Stripe live secret
  { name: "Stripe secret", re: /\bsk_live_[A-Za-z0-9]{20,}\b/ },
  // OpenAI key
  { name: "OpenAI key", re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  // AWS access key
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  // Google API key
  { name: "Google API key", re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  // Generic "PRIVATE KEY" PEM block
  { name: "PEM private key", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
];

const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".html", ".css", ".md", ".env", ".map", ".txt",
]);

const violations = [];

async function* walk(dir) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return; }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".git")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function shouldScan(file) {
  const ext = path.extname(file).toLowerCase();
  return TEXT_EXT.has(ext) || ext === "";
}

async function scanFile(file, label) {
  if (!shouldScan(file)) return;
  let content;
  try { content = await fs.readFile(file, "utf8"); }
  catch { return; }

  // Skip the scanner itself & this allowlist file
  const rel = path.relative(ROOT, file);
  if (rel === "scripts/scan-secrets.mjs") return;
  if (rel === ".secret-scan-allowlist.txt") return;

  for (const name of FORBIDDEN_NAMES) {
    // catch direct identifier usage in client code
    const re = new RegExp(`\\b${name}\\b`);
    if (re.test(content)) {
      violations.push({ file: rel, label, kind: `forbidden secret name: ${name}` });
    }
  }
  for (const { name, re } of FORBIDDEN_PATTERNS) {
    if (re.test(content)) {
      violations.push({ file: rel, label, kind: `pattern: ${name}` });
    }
  }
}

async function main() {
  // Source scan
  for (const d of SOURCE_DIRS) {
    const full = path.join(ROOT, d);
    for await (const f of walk(full)) await scanFile(f, "source");
  }
  for (const f of SOURCE_FILES) await scanFile(path.join(ROOT, f), "source");

  if (SCAN_BUNDLE) {
    for (const d of BUNDLE_DIRS) {
      const full = path.join(ROOT, d);
      for await (const f of walk(full)) await scanFile(f, "bundle");
    }
  }

  if (violations.length === 0) {
    console.log("✅ secret-scan: clean");
    process.exit(0);
  }
  console.error("❌ secret-scan: forbidden secrets detected in client-side files\n");
  for (const v of violations) {
    console.error(`  [${v.label}] ${v.file} — ${v.kind}`);
  }
  console.error("\nMove these to Edge Function env / Lovable Cloud secrets and re-run.");
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(2); });
