// Node built-in test runner — run via `node --test scripts/__tests__/security-links.test.mjs`.
// Fails if any FIX_MAP/REMEDIATION row points to a missing file or symbol.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("security remediation links resolve to real files and symbols", () => {
  const res = spawnSync("node", ["scripts/security-verify-links.mjs"], { encoding: "utf8" });
  assert.equal(res.status, 0, `verify-links failed:\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`);
});
