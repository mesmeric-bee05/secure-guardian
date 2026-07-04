// E2E tests for mpesa-callback: Safaricom contract requires we always ack
// {ResultCode:0}. We assert the ack for success (0), cancelled (1032), other
// failures, and malformed payloads. When a donation row with a matching
// CheckoutRequestID exists, the callback updates its status.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const URL_FN = `${SUPABASE_URL}/functions/v1/mpesa-callback`;

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

Deno.test({ ...opts, name: "mpesa-callback: acks malformed payload" }, async () => {
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

Deno.test({ ...opts, name: "mpesa-callback: 405 on GET" }, async () => {
  const res = await fetch(URL_FN, { method: "GET" });
  assertEquals(res.status, 405);
  await res.text();
});

Deno.test({
  ...opts,
  name: "mpesa-callback: success updates donation to status=success + receipt",
  ignore: !SERVICE_KEY,
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
  ignore: !SERVICE_KEY,
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
  ignore: !SERVICE_KEY,
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
