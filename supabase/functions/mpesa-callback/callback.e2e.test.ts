// E2E tests for mpesa-callback: Safaricom contract requires we always ack
// {ResultCode:0}. We assert the ack for success (0), cancelled (1032), other
// failures, and malformed payloads. When a donation row with a matching
// CheckoutRequestID exists, the callback updates its status.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CB_TOKEN = Deno.env.get("MPESA_CALLBACK_TOKEN") ?? "";
const URL_FN = `${SUPABASE_URL}/functions/v1/mpesa-callback?token=${encodeURIComponent(CB_TOKEN)}`;
const URL_FN_NOTOKEN = `${SUPABASE_URL}/functions/v1/mpesa-callback`;

const opts = { sanitizeOps: false, sanitizeResources: false } as const;

function stkBody(
  checkoutId: string,
  resultCode: number,
  extras: Record<string, string | number> = {},
) {
  const items = Object.entries(extras).map(([Name, Value]) => ({ Name, Value }));
  return JSON.stringify({
    Body: {
      stkCallback: {
        MerchantRequestID: "test-merchant",
        CheckoutRequestID: checkoutId,
        ResultCode: resultCode,
        ResultDesc: resultCode === 0 ? "Success" : resultCode === 1032 ? "Cancelled" : "Failed",
        CallbackMetadata: items.length ? { Item: items } : undefined,
      },
    },
  });
}

Deno.test({ ...opts, name: "mpesa-callback: rejects callbacks without the shared token" }, async () => {
  const res = await fetch(URL_FN_NOTOKEN, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: stkBody("spoofed-checkout-id", 0, { MpesaReceiptNumber: "FAKE1", Amount: 1 }),
  });
  assert(res.status === 401 || res.status === 503, `expected 401/503, got ${res.status}`);
  await res.text();
});

Deno.test({ ...opts, name: "mpesa-callback: rejects an invalid shared token" }, async () => {
  const res = await fetch(`${URL_FN_NOTOKEN}?token=not-the-real-token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: stkBody("spoofed-checkout-id", 0),
  });
  assert(res.status === 401 || res.status === 503, `expected 401/503, got ${res.status}`);
  await res.text();
});

Deno.test({ ...opts, name: "mpesa-callback: acks malformed payload", ignore: !CB_TOKEN }, async () => {
  const res = await fetch(URL_FN, { method: "POST", body: "not-json" });
  const j = await res.json();
  assertEquals(j.ResultCode, 0);
});

Deno.test({ ...opts, name: "mpesa-callback: acks missing stkCallback" }, async () => {
  const res = await fetch(URL_FN, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Body: {} }),
  });
  const j = await res.json();
  assertEquals(j.ResultCode, 0);
});

Deno.test({ ...opts, name: "mpesa-callback: 405 on GET", ignore: !CB_TOKEN }, async () => {
  const res = await fetch(URL_FN, { method: "GET" });
  assertEquals(res.status, 405);
  await res.text();
});

Deno.test({
  ...opts,
  name: "mpesa-callback: success updates donation to status=success + receipt",
  ignore: !SERVICE_KEY || !CB_TOKEN,
}, async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  const checkoutId = `test-${crypto.randomUUID()}`;
  // Seed a donation row with a real user_id from user_roles (any authenticated user).
  const { data: anyUser } = await admin.from("user_roles").select("user_id").limit(1).single();
  if (!anyUser) return; // no users in DB, skip silently
  const { error: insErr } = await admin.from("donations").insert({
    user_id: anyUser.user_id, amount_kes: 100, phone_msisdn: "254712345678",
    status: "pending", checkout_request_id: checkoutId, merchant_request_id: "test-merchant",
  });
  assert(!insErr, `seed insert failed: ${insErr?.message}`);

  const res = await fetch(URL_FN, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: stkBody(checkoutId, 0, { MpesaReceiptNumber: "TEST123ABC", Amount: 100 }),
  });
  const j = await res.json();
  assertEquals(j.ResultCode, 0);

  const { data: row } = await admin.from("donations")
    .select("status, mpesa_receipt").eq("checkout_request_id", checkoutId).single();
  assertEquals(row?.status, "success");
  assertEquals(row?.mpesa_receipt, "TEST123ABC");
  await admin.from("donations").delete().eq("checkout_request_id", checkoutId);
});

Deno.test({
  ...opts,
  name: "mpesa-callback: cancelled (1032) sets status=cancelled",
  ignore: !SERVICE_KEY || !CB_TOKEN,
}, async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  const checkoutId = `test-${crypto.randomUUID()}`;
  const { data: anyUser } = await admin.from("user_roles").select("user_id").limit(1).single();
  if (!anyUser) return;
  await admin.from("donations").insert({
    user_id: anyUser.user_id, amount_kes: 50, phone_msisdn: "254712345678",
    status: "pending", checkout_request_id: checkoutId,
  });
  const res = await fetch(URL_FN, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: stkBody(checkoutId, 1032),
  });
  assertEquals((await res.json()).ResultCode, 0);
  const { data: row } = await admin.from("donations")
    .select("status").eq("checkout_request_id", checkoutId).single();
  assertEquals(row?.status, "cancelled");
  await admin.from("donations").delete().eq("checkout_request_id", checkoutId);
});

Deno.test({
  ...opts,
  name: "mpesa-callback: other failure codes set status=failed",
  ignore: !SERVICE_KEY || !CB_TOKEN,
}, async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  const checkoutId = `test-${crypto.randomUUID()}`;
  const { data: anyUser } = await admin.from("user_roles").select("user_id").limit(1).single();
  if (!anyUser) return;
  await admin.from("donations").insert({
    user_id: anyUser.user_id, amount_kes: 50, phone_msisdn: "254712345678",
    status: "pending", checkout_request_id: checkoutId,
  });
  const res = await fetch(URL_FN, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: stkBody(checkoutId, 2001),
  });
  assertEquals((await res.json()).ResultCode, 0);
  const { data: row } = await admin.from("donations")
    .select("status").eq("checkout_request_id", checkoutId).single();
  assertEquals(row?.status, "failed");
  await admin.from("donations").delete().eq("checkout_request_id", checkoutId);
});

// ---------------------------------------------------------------------------
// Regression: token rejection + audit trail for every rejected attempt.
// ---------------------------------------------------------------------------

async function latestRejection(admin: any, since: string) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const { data } = await admin
      .from("audit_logs")
      .select("action, resource_type, resource_id, details, created_at")
      .eq("action", "mpesa_callback_rejected")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5);
    if (data && data.length) return data as Array<{ details: Record<string, unknown>; resource_id: string | null }>;
    await new Promise((r) => setTimeout(r, 400));
  }
  return [];
}

for (const variant of ["no token", "empty token", "wrong token", "wrong header token"] as const) {
  Deno.test({ ...opts, name: `mpesa-callback: rejects callback with ${variant}` }, async () => {
    const url = variant === "no token"
      ? URL_FN_NOTOKEN
      : variant === "empty token"
      ? `${URL_FN_NOTOKEN}?token=`
      : variant === "wrong token"
      ? `${URL_FN_NOTOKEN}?token=definitely-not-the-real-token`
      : URL_FN_NOTOKEN;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (variant === "wrong header token") headers["x-callback-token"] = "nope-nope-nope";

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: stkBody(`spoof-${crypto.randomUUID()}`, 0, { MpesaReceiptNumber: "FAKE", Amount: 1 }),
    });
    assert(res.status === 401 || res.status === 503, `expected 401/503, got ${res.status}`);
    const body = await res.json();
    assert(body.ResultDesc === "Unauthorized" || body.ResultDesc === "Not configured");
    // The rejection body must never echo a token value.
    assert(!JSON.stringify(body).includes("token="), "response leaked a token");
  });
}

Deno.test({
  ...opts,
  name: "mpesa-callback: a spoofed callback cannot change a pending donation and is audited",
  ignore: !SERVICE_KEY,
}, async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  const checkoutId = `test-${crypto.randomUUID()}`;
  const { data: anyUser } = await admin.from("user_roles").select("user_id").limit(1).single();
  if (!anyUser) return;
  await admin.from("donations").insert({
    user_id: anyUser.user_id, amount_kes: 75, phone_msisdn: "254712345678",
    status: "pending", checkout_request_id: checkoutId,
  });
  const since = new Date().toISOString();

  const res = await fetch(`${URL_FN_NOTOKEN}?token=forged-token-value`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: stkBody(checkoutId, 0, { MpesaReceiptNumber: "FORGED1", Amount: 75 }),
  });
  assert(res.status === 401 || res.status === 503, `expected 401/503, got ${res.status}`);
  await res.text();

  // Donation untouched.
  const { data: row } = await admin.from("donations")
    .select("status, mpesa_receipt").eq("checkout_request_id", checkoutId).single();
  assertEquals(row?.status, "pending");
  assertEquals(row?.mpesa_receipt, null);

  // Rejection audited with a reason, and no token value stored.
  const rows = await latestRejection(admin, since);
  assert(rows.length > 0, "expected an mpesa_callback_rejected audit entry");
  const reason = String(rows[0].details.reason);
  assert(
    ["invalid_token", "missing_token", "token_not_configured"].includes(reason),
    `unexpected reason: ${reason}`,
  );
  assert(!JSON.stringify(rows[0].details).includes("forged-token-value"), "audit leaked the token");

  await admin.from("donations").delete().eq("checkout_request_id", checkoutId);
  await admin.from("audit_logs").delete().eq("action", "mpesa_callback_rejected").gte("created_at", since);
});

Deno.test({
  ...opts,
  name: "mpesa-callback: amount mismatch is rejected, marked failed and audited",
  ignore: !SERVICE_KEY || !CB_TOKEN,
}, async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  const checkoutId = `test-${crypto.randomUUID()}`;
  const { data: anyUser } = await admin.from("user_roles").select("user_id").limit(1).single();
  if (!anyUser) return;
  await admin.from("donations").insert({
    user_id: anyUser.user_id, amount_kes: 500, phone_msisdn: "254712345678",
    status: "pending", checkout_request_id: checkoutId,
  });
  const since = new Date().toISOString();

  const res = await fetch(URL_FN, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: stkBody(checkoutId, 0, { MpesaReceiptNumber: "MISMATCH1", Amount: 1 }),
  });
  assertEquals((await res.json()).ResultCode, 0);

  const { data: row } = await admin.from("donations")
    .select("status, result_desc, mpesa_receipt").eq("checkout_request_id", checkoutId).single();
  assertEquals(row?.status, "failed");
  assertEquals(row?.result_desc, "amount_mismatch");
  assertEquals(row?.mpesa_receipt, null);

  const rows = await latestRejection(admin, since);
  assert(rows.some((r) => r.details.reason === "amount_mismatch"), "expected amount_mismatch audit entry");

  await admin.from("donations").delete().eq("checkout_request_id", checkoutId);
  await admin.from("audit_logs").delete().eq("action", "mpesa_callback_rejected").gte("created_at", since);
});

Deno.test({
  ...opts,
  name: "mpesa-callback: replay against a non-pending donation is refused and audited",
  ignore: !SERVICE_KEY || !CB_TOKEN,
}, async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  const checkoutId = `test-${crypto.randomUUID()}`;
  const { data: anyUser } = await admin.from("user_roles").select("user_id").limit(1).single();
  if (!anyUser) return;
  await admin.from("donations").insert({
    user_id: anyUser.user_id, amount_kes: 100, phone_msisdn: "254712345678",
    status: "pending", checkout_request_id: checkoutId,
  });
  // First (legit) callback marks it success.
  await (await fetch(URL_FN, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: stkBody(checkoutId, 0, { MpesaReceiptNumber: "REPLAY1", Amount: 100 }),
  })).text();
  const since = new Date().toISOString();

  // Replay attempts to flip it to failed — must be refused.
  const res = await fetch(URL_FN, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: stkBody(checkoutId, 2001),
  });
  assertEquals((await res.json()).ResultCode, 0);
  const { data: row } = await admin.from("donations")
    .select("status, mpesa_receipt").eq("checkout_request_id", checkoutId).single();
  assertEquals(row?.status, "success");
  assertEquals(row?.mpesa_receipt, "REPLAY1");

  const rows = await latestRejection(admin, since);
  assert(rows.some((r) => r.details.reason === "donation_not_pending"), "expected replay audit entry");

  await admin.from("donations").delete().eq("checkout_request_id", checkoutId);
  await admin.from("audit_logs").delete().eq("action", "mpesa_callback_rejected").gte("created_at", since);
});

// ---------------------------------------------------------------------------
// Rotation: dual-acceptance window (current + next/previous accepted together).
// ---------------------------------------------------------------------------

const CB_TOKEN_NEXT = Deno.env.get("MPESA_CALLBACK_TOKEN_NEXT") ?? "";
const CB_TOKEN_PREV = Deno.env.get("MPESA_CALLBACK_TOKEN_PREVIOUS") ?? "";

for (
  const [slot, token] of [
    ["next", CB_TOKEN_NEXT],
    ["previous", CB_TOKEN_PREV],
  ] as const
) {
  Deno.test({
    ...opts,
    name: `mpesa-callback: accepts the ${slot} token during the rotation window`,
    // Only meaningful while that rotation slot is actually provisioned.
    ignore: !SERVICE_KEY || !token || token === CB_TOKEN,
  }, async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
    const checkoutId = `test-${crypto.randomUUID()}`;
    const { data: anyUser } = await admin.from("user_roles").select("user_id").limit(1).single();
    if (!anyUser) return;
    await admin.from("donations").insert({
      user_id: anyUser.user_id, amount_kes: 200, phone_msisdn: "254712345678",
      status: "pending", checkout_request_id: checkoutId,
    });

    const res = await fetch(
      `${URL_FN_NOTOKEN}?token=${encodeURIComponent(token)}`,
      {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: stkBody(checkoutId, 0, { MpesaReceiptNumber: "ROT1", Amount: 200 }),
      },
    );
    assertEquals(res.status, 200);
    assertEquals((await res.json()).ResultCode, 0);

    const { data: row } = await admin.from("donations")
      .select("status, mpesa_receipt").eq("checkout_request_id", checkoutId).single();
    assertEquals(row?.status, "success");
    assertEquals(row?.mpesa_receipt, "ROT1");

    await admin.from("donations").delete().eq("checkout_request_id", checkoutId);
  });
}

Deno.test({
  ...opts,
  name: "mpesa-callback: current token still works while a rotation window is open",
  ignore: !SERVICE_KEY || !CB_TOKEN || (!CB_TOKEN_NEXT && !CB_TOKEN_PREV),
}, async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  const checkoutId = `test-${crypto.randomUUID()}`;
  const { data: anyUser } = await admin.from("user_roles").select("user_id").limit(1).single();
  if (!anyUser) return;
  await admin.from("donations").insert({
    user_id: anyUser.user_id, amount_kes: 300, phone_msisdn: "254712345678",
    status: "pending", checkout_request_id: checkoutId,
  });
  const res = await fetch(URL_FN, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: stkBody(checkoutId, 0, { MpesaReceiptNumber: "ROT2", Amount: 300 }),
  });
  assertEquals((await res.json()).ResultCode, 0);
  const { data: row } = await admin.from("donations")
    .select("status").eq("checkout_request_id", checkoutId).single();
  assertEquals(row?.status, "success");
  await admin.from("donations").delete().eq("checkout_request_id", checkoutId);
});

// ---------------------------------------------------------------------------
// Every denial writes exactly one audit row carrying the right reason AND,
// where a donation is resolvable, that donation's id.
// ---------------------------------------------------------------------------

Deno.test({
  ...opts,
  name: "mpesa-callback: each denial reason produces an audit row with the donation id",
  ignore: !SERVICE_KEY || !CB_TOKEN,
}, async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  const { data: anyUser } = await admin.from("user_roles").select("user_id").limit(1).single();
  if (!anyUser) return;

  const seed = async (amount: number) => {
    const checkoutId = `test-${crypto.randomUUID()}`;
    const { data } = await admin.from("donations").insert({
      user_id: anyUser.user_id, amount_kes: amount, phone_msisdn: "254712345678",
      status: "pending", checkout_request_id: checkoutId,
    }).select("id").single();
    return { checkoutId, id: data!.id as string };
  };

  const since = new Date().toISOString();
  const cleanup: string[] = [];

  // (a) invalid token — donation must stay pending, audit has the reason.
  const bad = await seed(120);
  cleanup.push(bad.checkoutId);
  await (await fetch(`${URL_FN_NOTOKEN}?token=totally-wrong-${crypto.randomUUID()}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: stkBody(bad.checkoutId, 0, { MpesaReceiptNumber: "X1", Amount: 120 }),
  })).text();

  // (b) amount mismatch — audit must carry the donation id.
  const mism = await seed(400);
  cleanup.push(mism.checkoutId);
  await (await fetch(URL_FN, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: stkBody(mism.checkoutId, 0, { MpesaReceiptNumber: "X2", Amount: 7 }),
  })).text();

  // (c) unknown donation — no row exists for this checkout id.
  const unknownCheckout = `unknown-${crypto.randomUUID()}`;
  await (await fetch(URL_FN, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: stkBody(unknownCheckout, 0, { MpesaReceiptNumber: "X3", Amount: 10 }),
  })).text();

  const rows = await latestRejection(admin, since);
  assert(rows.length >= 3, `expected >=3 rejection audit rows, got ${rows.length}`);

  const byReason = (r: string) => rows.filter((x) => x.details.reason === r);

  assertEquals(byReason("invalid_token").length, 1);

  const mismatchRows = byReason("amount_mismatch");
  assertEquals(mismatchRows.length, 1);
  assertEquals(mismatchRows[0].resource_id, mism.id);
  assertEquals(mismatchRows[0].details.expected_kes, 400);
  assertEquals(mismatchRows[0].details.paid_kes, 7);

  const unknownRows = byReason("unknown_donation");
  assertEquals(unknownRows.length, 1);
  assertEquals(unknownRows[0].details.checkout_request_id, unknownCheckout);
  assertEquals(unknownRows[0].resource_id, null);

  // Spoofed callback left its donation untouched.
  const { data: still } = await admin.from("donations")
    .select("status").eq("checkout_request_id", bad.checkoutId).single();
  assertEquals(still?.status, "pending");

  for (const c of cleanup) await admin.from("donations").delete().eq("checkout_request_id", c);
  await admin.from("audit_logs").delete().eq("action", "mpesa_callback_rejected").gte("created_at", since);
});

// ---------------------------------------------------------------------------
// Replay with a valid token and a reused reference id must not double-apply.
// ---------------------------------------------------------------------------

Deno.test({
  ...opts,
  name: "mpesa-callback: replaying the identical payload with a valid token is refused",
  ignore: !SERVICE_KEY || !CB_TOKEN,
}, async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  const checkoutId = `test-${crypto.randomUUID()}`;
  const { data: anyUser } = await admin.from("user_roles").select("user_id").limit(1).single();
  if (!anyUser) return;
  const { data: seeded } = await admin.from("donations").insert({
    user_id: anyUser.user_id, amount_kes: 250, phone_msisdn: "254712345678",
    status: "pending", checkout_request_id: checkoutId,
  }).select("id").single();

  const payload = stkBody(checkoutId, 0, { MpesaReceiptNumber: "DUP777", Amount: 250 });
  const send = () =>
    fetch(URL_FN, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });

  assertEquals((await (await send()).json()).ResultCode, 0);
  const { data: first } = await admin.from("donations")
    .select("status, mpesa_receipt, updated_at").eq("id", seeded!.id).single();
  assertEquals(first?.status, "success");

  const since = new Date().toISOString();
  // Byte-identical replay of the same reference id.
  assertEquals((await (await send()).json()).ResultCode, 0);

  const { data: second } = await admin.from("donations")
    .select("status, mpesa_receipt, updated_at").eq("id", seeded!.id).single();
  assertEquals(second?.status, "success");
  assertEquals(second?.mpesa_receipt, "DUP777");
  // No second write occurred (status guard blocks the update entirely).
  assertEquals(second?.updated_at, first?.updated_at);

  // Exactly one donation row still exists for this reference id.
  const { data: all } = await admin.from("donations")
    .select("id").eq("checkout_request_id", checkoutId);
  assertEquals(all?.length, 1);

  const rows = await latestRejection(admin, since);
  const replay = rows.filter((r) => r.details.reason === "donation_not_pending");
  assertEquals(replay.length, 1);
  assertEquals(replay[0].resource_id, seeded!.id);
  assertEquals(replay[0].details.current_status, "success");

  await admin.from("donations").delete().eq("checkout_request_id", checkoutId);
  await admin.from("audit_logs").delete().eq("action", "mpesa_callback_rejected").gte("created_at", since);
});
