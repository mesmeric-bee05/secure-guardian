#!/usr/bin/env node
/**
 * Environment-driven, phased rotation of the M-PESA callback shared secret.
 *
 * Stages:
 *   prepare  — MPESA_CALLBACK_TOKEN_NEXT is published; mpesa-callback now
 *              accepts BOTH current and next (dual verification window).
 *   cutover  — new STK pushes are signed with NEXT
 *              (MPESA_CALLBACK_ROTATION_STAGE=cutover).
 *   retire   — NEXT is promoted to MPESA_CALLBACK_TOKEN, the old value moves to
 *              MPESA_CALLBACK_TOKEN_PREVIOUS, then PREVIOUS/NEXT are cleared.
 *   status   — read live rotation state from the mpesa-config-check function.
 *
 * This script NEVER prints a token value — only set/unset and lengths.
 *
 * Usage:
 *   node scripts/mpesa-rotate-token.mjs --stage=prepare
 *   node scripts/mpesa-rotate-token.mjs --stage=status
 */

const args = process.argv.slice(2);
const stageArg = (args.find((a) => a.startsWith("--stage=")) ?? "").split("=")[1];
const STAGES = ["prepare", "cutover", "retire", "status"];

if (!STAGES.includes(stageArg)) {
  console.error(`Usage: node scripts/mpesa-rotate-token.mjs --stage=<${STAGES.join("|")}>`);
  process.exit(2);
}

const env = process.env;
const CURRENT = env.MPESA_CALLBACK_TOKEN ?? "";
const NEXT = env.MPESA_CALLBACK_TOKEN_NEXT ?? "";
const PREVIOUS = env.MPESA_CALLBACK_TOKEN_PREVIOUS ?? "";
const STAGE_ENV = (env.MPESA_CALLBACK_ROTATION_STAGE ?? "steady").toLowerCase();

const describe = (name, v) => `${name}: ${v ? `set (len ${v.length})` : "unset"}`;

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

function localState() {
  console.log("Local environment view (no values printed):");
  console.log("  " + describe("MPESA_CALLBACK_TOKEN", CURRENT));
  console.log("  " + describe("MPESA_CALLBACK_TOKEN_NEXT", NEXT));
  console.log("  " + describe("MPESA_CALLBACK_TOKEN_PREVIOUS", PREVIOUS));
  console.log(`  MPESA_CALLBACK_ROTATION_STAGE: ${STAGE_ENV}`);
}

async function remoteStatus() {
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const email = env.TEST_ADMIN_EMAIL;
  const password = env.TEST_ADMIN_PASSWORD;
  if (!url || !anon || !email || !password) {
    console.log(
      "Skipping remote status: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY / TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD required.",
    );
    return null;
  }
  const tokenRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon },
    body: JSON.stringify({ email, password }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) fail("Admin sign-in failed for rotation status.");

  const res = await fetch(`${url}/functions/v1/mpesa-config-check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${tokenJson.access_token}`,
    },
    body: JSON.stringify({}),
  });
  const json = await res.json();
  const rotation = json.callback_token_rotation ?? null;
  console.log("Live rotation state:", JSON.stringify(rotation, null, 2));
  return rotation;
}

const nextAction = {
  prepare:
    "Next: set MPESA_CALLBACK_ROTATION_STAGE=cutover and run --stage=cutover so new pushes sign with NEXT.",
  cutover:
    "Next: wait out in-flight callbacks (>= 15 min / no 'accepted with NEXT token' gap), then run --stage=retire.",
  retire:
    "Rotation complete. Keep MPESA_CALLBACK_ROTATION_STAGE=steady until the next rotation.",
  status: "",
};

(async () => {
  localState();
  const remote = await remoteStatus();

  if (stageArg === "status") {
    process.exit(0);
  }

  if (stageArg === "prepare") {
    if (!CURRENT) fail("MPESA_CALLBACK_TOKEN must be set before preparing a rotation.");
    if (!NEXT) fail("Set MPESA_CALLBACK_TOKEN_NEXT (>= 32 random chars) before --stage=prepare.");
    if (NEXT.length < 32) fail("MPESA_CALLBACK_TOKEN_NEXT must be at least 32 characters.");
    if (NEXT === CURRENT) fail("MPESA_CALLBACK_TOKEN_NEXT must differ from MPESA_CALLBACK_TOKEN.");
    if (remote && remote.next_set !== true) {
      fail("Deployed functions do not see MPESA_CALLBACK_TOKEN_NEXT yet — redeploy/rebind secrets.");
    }
    console.log("OK: dual verification window is open (current + next accepted).");
  }

  if (stageArg === "cutover") {
    if (!CURRENT || !NEXT) fail("Both MPESA_CALLBACK_TOKEN and _NEXT must be set during cutover.");
    if (STAGE_ENV !== "cutover") {
      fail("Set MPESA_CALLBACK_ROTATION_STAGE=cutover so mpesa-stk-push signs with NEXT.");
    }
    if (remote && remote.signing_with !== "next") {
      fail("Deployed mpesa-stk-push is still signing with the current token.");
    }
    if (remote && remote.all_distinct === false) {
      fail("Rotation slots contain duplicate values — abort and re-generate NEXT.");
    }
    console.log("OK: new pushes are signed with NEXT; both tokens still verify.");
  }

  if (stageArg === "retire") {
    if (NEXT || PREVIOUS) {
      fail(
        "Before retiring: promote NEXT into MPESA_CALLBACK_TOKEN, set MPESA_CALLBACK_ROTATION_STAGE=steady, then DELETE MPESA_CALLBACK_TOKEN_NEXT and MPESA_CALLBACK_TOKEN_PREVIOUS.",
      );
    }
    if (!CURRENT) fail("MPESA_CALLBACK_TOKEN must remain set after retirement.");
    if (STAGE_ENV !== "steady") fail("MPESA_CALLBACK_ROTATION_STAGE must be back to 'steady'.");
    if (remote && remote.dual_window_open === true) {
      fail("Deployed functions still accept more than one token — the window is not closed.");
    }
    console.log("OK: single-token steady state restored.");
  }

  if (nextAction[stageArg]) console.log(nextAction[stageArg]);
})().catch((e) => fail(e instanceof Error ? e.message : String(e)));
