// M-PESA Daraja STK callback receiver. Public (Safaricom calls this).
// verify_jwt=false. No user auth expected. We map by CheckoutRequestID.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

serve(async (req) => {
  // Safaricom sends POST, no CORS needed but include basic headers.
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ResultCode: 1, ResultDesc: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json();
    const cb = body?.Body?.stkCallback;
    if (!cb?.CheckoutRequestID) {
      // Always ack 0 so Safaricom stops retrying.
      return new Response(
        JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted (no-op)" }),
        { headers: { "Content-Type": "application/json" } },
      );
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

    let status: "success" | "failed" | "cancelled" = "failed";
    if (resultCode === 0) status = "success";
    else if (resultCode === 1032) status = "cancelled";

    await supabase
      .from("donations")
      .update({
        status,
        mpesa_receipt: receipt ?? null,
        result_desc: resultDesc ?? null,
      })
      .eq("checkout_request_id", cb.CheckoutRequestID);

    return new Response(
      JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("mpesa-callback error", err instanceof Error ? err.message : err);
    // Still return 0 so Safaricom doesn't spam retries.
    return new Response(
      JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted with error" }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
});
