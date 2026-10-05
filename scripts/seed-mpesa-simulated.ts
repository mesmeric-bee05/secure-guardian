// Seeds SIMULATED M-PESA callback outcomes by sending real requests to the
// deployed mpesa-callback function, so ledger, donation and audit rows come
// from the production code path. Every row is identifiable as simulated:
// checkout ids start with `sim-<run>-` and receipts with `SIM`.
// These are NOT Safaricom traffic.
//
// Usage: deno run --allow-net --allow-env --allow-read scripts/seed-mpesa-simulated.ts
// Requires SUPABASE_SERVICE_ROLE_KEY and MPESA_CALLBACK_TOKEN. Prints JSON.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CB_TOKEN = Deno.env.get("MPESA_CALLBACK_TOKEN")!;
if (!SERVICE_KEY || !CB_TOKEN) {
  console.error("SUPABASE_SERVICE_ROLE_KEY and MPESA_CALLBACK_TOKEN are required");
  Deno.exit(2);
}

export async function seedSimulatedOutcomes() {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const run = crypto.randomUUID().slice(0, 8);
  const { data: anyUser } = await admin.from("user_roles").select("user_id").limit(1).single();
  const userId = anyUser?.user_id ?? null;

  const mk = async (suffix: string, amount: number) => {
    const checkoutId = `sim-${run}-${suffix}`;
    const { data, error } = await admin.from("donations").insert({
      user_id: userId, amount_kes: amount, phone_msisdn: "254700000000",
      status: "pending", checkout_request_id: checkoutId, merchant_request_id: `sim-${run}`,
    }).select("id").single();
    if (error) throw new Error(`seed donation failed: ${error.message}`);
    return { id: data.id as string, checkoutId };
  };

  const post = async (checkoutId: string, code: number, extras: Record<string, string | number>, token = CB_TOKEN) => {
    const items = Object.entries(extras).map(([Name, Value]) => ({ Name, Value }));
    const res = await fetch(`${SUPABASE_URL}/functions/v1/mpesa-callback?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Body: { stkCallback: {
        MerchantRequestID: `sim-${run}`, CheckoutRequestID: checkoutId, ResultCode: code,
        ResultDesc: code === 0 ? "Success" : "Failed",
        CallbackMetadata: items.length ? { Item: items } : undefined,
      } } }),
    });
    await res.text();
    return res.status;
  };

  const success = await mk("success", 100);
  const mismatch = await mk("mismatch", 200);
  const pending = await mk("pending", 300);
  const receipt = `SIM${run.toUpperCase()}OK`;

  await post(success.checkoutId, 0, { MpesaReceiptNumber: receipt, Amount: 100 });
  await post(success.checkoutId, 0, { MpesaReceiptNumber: receipt, Amount: 100 }); // replay
  await post(mismatch.checkoutId, 0, { MpesaReceiptNumber: `SIM${run.toUpperCase()}MM`, Amount: 1 });
  await post(`sim-${run}-unknown`, 0, { MpesaReceiptNumber: `SIM${run.toUpperCase()}UK`, Amount: 50 });
  const badTokenStatus = await post(pending.checkoutId, 0, { Amount: 300 }, "invalid-simulated-token");

  return { run, success, mismatch, pending, receipt, badTokenStatus };
}

if (import.meta.main) {
  console.log(JSON.stringify(await seedSimulatedOutcomes(), null, 2));
}
