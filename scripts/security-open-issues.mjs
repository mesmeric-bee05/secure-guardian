#!/usr/bin/env node
/**
 * Idempotently sync GitHub issues with non-allowlisted security findings.
 *
 * Requires `gh` CLI authenticated via GITHUB_TOKEN (provided by Actions).
 * Idempotency key: hidden marker `<!-- security-finding-id: <scanner>:<id> -->`
 * embedded in issue body.
 *
 * - Creates an issue per open finding when none exists.
 * - Reopens + updates body for existing matching issues.
 * - Closes (with comment) issues whose finding is gone or now allowlisted.
 *
 * Env:
 *   GITHUB_REPOSITORY    owner/repo (Actions default)
 *   GITHUB_SHA           commit SHA for permalinks
 *   SEVERITY_THRESHOLD   info|warn|high|critical (default: high)
 *   DRY_RUN=1            print actions without calling gh
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SEV, flattenSnapshot, isAllowlisted, mapFor } from "./lib/findingMap.mjs";

const ROOT = process.cwd();
const repo = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA || "main";
const threshold = (process.env.SEVERITY_THRESHOLD || "high").toLowerCase();
const thresholdIdx = Math.max(0, SEV.indexOf(threshold));
const dry = process.env.DRY_RUN === "1";

if (!repo && !dry) {
  console.error("security-open-issues: GITHUB_REPOSITORY not set; refusing to run outside CI. Set DRY_RUN=1 to preview.");
  process.exit(2);
}

const snapshot = JSON.parse(await fs.readFile(path.join(ROOT, "security/snapshots/latest.json"), "utf8"));
const allowlist = JSON.parse(await fs.readFile(path.join(ROOT, "security/allowlist.json"), "utf8"));

function gh(args, input) {
  if (dry) {
    console.log(`[dry] gh ${args.join(" ")}`);
    return { stdout: "[]", status: 0 };
  }
  const res = spawnSync("gh", args, { input, encoding: "utf8" });
  if (res.status !== 0) {
    console.error(`gh ${args.join(" ")} failed: ${res.stderr}`);
  }
  return res;
}

function marker(r) {
  return `<!-- security-finding-id: ${r.scanner_name}:${r.internal_id} -->`;
}

function buildBody(r) {
  const m = mapFor(r.internal_id);
  const fileLink = m.file.startsWith("pseudo:")
    ? m.file.replace(/^pseudo:/, "_(pseudo-path)_ ")
    : `[\`${m.file}\`](https://github.com/${repo}/blob/${sha}/${m.file}${m.line ? `#L${m.line}` : ""})`;
  return [
    marker(r),
    `**Scanner:** \`${r.scanner_name}\`  `,
    `**Severity:** \`${r.severity}\`  `,
    `**Internal ID:** \`${r.internal_id}\`  `,
    `**Detected at:** ${r.created_at}  `,
    `**Owner:** ${m.owner || "platform-security"}`,
    "",
    `### Affected`,
    "`" + m.affected + "`",
    "",
    `### Location`,
    fileLink,
    "",
    `### Recommended fix`,
    m.fix,
    "",
    r.link ? `### Scanner reference\n${r.link}` : "",
  ].filter(Boolean).join("\n");
}

// Build target set
const targets = new Map();
for (const r of flattenSnapshot(snapshot)) {
  if (isAllowlisted(allowlist, r)) continue;
  if (SEV.indexOf(r.severity) < thresholdIdx) continue;
  targets.set(`${r.scanner_name}:${r.internal_id}`, r);
}

// Fetch existing security issues
const list = gh([
  "issue", "list",
  "--repo", repo || "owner/repo",
  "--label", "security",
  "--state", "all",
  "--limit", "500",
  "--json", "number,title,body,state,labels",
]);
const existing = list.status === 0 ? JSON.parse(list.stdout || "[]") : [];
const byKey = new Map();
for (const iss of existing) {
  const m = /security-finding-id: ([^ ]+) -->/.exec(iss.body || "");
  if (m) byKey.set(m[1], iss);
}

// Ensure labels exist (best-effort)
const labelsNeeded = new Set(["security"]);
for (const r of targets.values()) {
  labelsNeeded.add(`severity:${r.severity}`);
  labelsNeeded.add(`scanner:${r.scanner_name}`);
}
for (const label of labelsNeeded) {
  gh(["label", "create", label, "--repo", repo || "owner/repo", "--force", "--color", "B60205"]);
}

// Create/update
for (const [key, r] of targets) {
  const m = mapFor(r.internal_id);
  const title = `[security] ${r.scanner_name}:${r.internal_id} — ${r.name}`;
  const body = buildBody(r);
  const labels = ["security", `severity:${r.severity}`, `scanner:${r.scanner_name}`];
  const iss = byKey.get(key);
  if (!iss) {
    gh([
      "issue", "create",
      "--repo", repo || "owner/repo",
      "--title", title,
      "--body", body,
      "--label", labels.join(","),
      "--assignee", m.owner || "",
    ].filter(Boolean));
    console.log(`opened: ${key}`);
  } else {
    gh(["issue", "edit", String(iss.number), "--repo", repo || "owner/repo", "--title", title, "--body", body, "--add-label", labels.join(",")]);
    if (iss.state !== "OPEN") gh(["issue", "reopen", String(iss.number), "--repo", repo || "owner/repo"]);
    console.log(`updated: ${key} (#${iss.number})`);
  }
}

// Close stale (open issues whose finding is gone/allowlisted)
for (const [key, iss] of byKey) {
  if (targets.has(key)) continue;
  if (iss.state !== "OPEN") continue;
  gh(["issue", "comment", String(iss.number), "--repo", repo || "owner/repo", "--body", "Finding no longer present in latest scan snapshot or now allowlisted — closing automatically."]);
  gh(["issue", "close", String(iss.number), "--repo", repo || "owner/repo", "--reason", "completed"]);
  console.log(`closed: ${key} (#${iss.number})`);
}

console.log(`security-open-issues: ${targets.size} target finding(s) synced.`);
