// M-PESA Daraja STK callback receiver. Public endpoint (Safaricom calls this),
// but authenticated with a shared secret token that is embedded in the callback
// URL we hand to Daraja at STK-push time (MPESA_CALLBACK_TOKEN).
//
// Spoofing defences:
//  1. Shared-secret token (query `?token=` or `x-callback-token` header).
//  2. Only rows currently in `pending` may transition (no replays/overwrites).
//  3. The callback amount must match the donation's recorded amount_kes before
//     a donation can be marked `success`.
// verify_jwt=false. No user auth expected. We map by CheckoutRequestID.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function tokenFromRequest(req: Request): string {
  const url = new URL(req.url);
  const q = url.searchParams.get("token");
  if (q) return q;
  const h = req.headers.get("x-callback-token");
  if (h) return h;
  // Support a trailing path segment: /mpesa-callback/<token>
  const seg = url.pathname.split("/").filter(Boolean).pop() ?? "";
  return seg === "mpesa-callback" ? "" : seg;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }
  if (req.method !== "POST") {
    return json({ ResultCode: 1, ResultDesc: "Method not allowed" }, 405);
  }

  // 1) Authenticate the caller as Safaricom via the shared callback secret.
  const expected = Deno.env.get("MPESA_CALLBACK_TOKEN") ?? "";
  if (!expected) {
    console.error("mpesa-callback: MPESA_CALLBACK_TOKEN not configured; rejecting");
    return json({ ResultCode: 1, ResultDesc: "Not configured" }, 503);
  }
  if (!safeEqual(tokenFromRequest(req), expected)) {
    console.warn("mpesa-callback: rejected callback with invalid token");
    return json({ ResultCode: 1, ResultDesc: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const cb = body?.Body?.stkCallback;
    if (!cb?.CheckoutRequestID) {
      // Always ack 0 so Safaricom stops retrying.
      return json({ ResultCode: 0, ResultDesc: "Accepted (no-op)" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const resultCode = cb.ResultCode as number;
    const resultDesc = cb.ResultDesc as string;
    const items = (cb.CallbackMetadata?.Item ?? []) as Array<{
      Name: string;
      Value?: string | number;
    }>;
    const getItem = (name: string) => items.find((i) => i.Name === name)?.Value;
    const receipt = getItem("MpesaReceiptNumber") as string | undefined;
    const paidAmount = Number(getItem("Amount"));

    let status: "success" | "failed" | "cancelled" = "failed";
    if (resultCode === 0) status = "success";
    else if (resultCode === 1032) status = "cancelled";

    // 2) Only pending donations may transition — blocks replays and overwrites.
    const { data: donation } = await supabase
      .from("donations")
      .select("id, amount_kes, status")
      .eq("checkout_request_id", cb.CheckoutRequestID)
      .maybeSingle();

    if (!donation || donation.status !== "pending") {
      return json({ ResultCode: 0, ResultDesc: "Accepted (no pending donation)" });
    }

    // 3) Amount must match the initiated STK push before we credit a success.
    if (status === "success" && Number.isFinite(paidAmount)) {
      if (Math.round(paidAmount) !== Math.round(Number(donation.amount_kes))) {
        console.warn("mpesa-callback: amount mismatch for donation", donation.id);
        await supabase
          .from("donations")
          .update({ status: "failed", result_desc: "amount_mismatch" })
          .eq("id", donation.id)
          .eq("status", "pending");
        return json({ ResultCode: 0, ResultDesc: "Accepted (amount mismatch)" });
      }
    }

    await supabase
      .from("donations")
      .update({
        status,
        mpesa_receipt: receipt ?? null,
        result_desc: resultDesc ?? null,
      })
      .eq("id", donation.id)
      .eq("status", "pending");

    return json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (err) {
    console.error("mpesa-callback error", err instanceof Error ? err.message : err);
    // Still return 0 so Safaricom doesn't spam retries.
    return json({ ResultCode: 0, ResultDesc: "Accepted with error" });
  }
});
