// M-PESA Daraja STK callback receiver. Public endpoint (Safaricom calls this),
// but authenticated with a shared secret token that is embedded in the callback
// URL we hand to Daraja at STK-push time (MPESA_CALLBACK_TOKEN).
//
// Spoofing defences:
//  1. Shared-secret token (query `?token=`, `x-callback-token` header, or path).
//     Supports zero-downtime rotation: MPESA_CALLBACK_TOKEN_PREVIOUS is also
//     accepted (verification only) while an overlap window is open.
//  2. Only rows currently in `pending` may transition (no replays/overwrites).
//  3. The callback amount must match the donation's recorded amount_kes before
//     a donation can be marked `success`.
//  4. Every rejection is written to audit_logs (reason + affected donation) and
//     unauthorized attempts additionally raise a security_events row.
// verify_jwt=false. No user auth expected. We map by CheckoutRequestID.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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

function clientIP(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    null
  );
}

let cached: SupabaseClient | null = null;
function svc(): SupabaseClient {
  if (!cached) {
    cached = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return cached;
}

/** Durable audit trail for every rejected callback attempt. */
async function auditRejection(
  reason: string,
  ip: string | null,
  details: Record<string, unknown>,
  donationId?: string | null,
) {
  try {
    const { error } = await svc().from("audit_logs").insert({
      user_id: null,
      action: "mpesa_callback_rejected",
      resource_type: "donations",
      resource_id: donationId ?? null,
      ip_address: ip,
      details: { reason, ...details },
    });
    if (error) console.error("mpesa-callback audit insert:", error.message);
  } catch (e) {
    console.error("mpesa-callback audit failure:", e instanceof Error ? e.message : e);
  }
}

async function securityEvent(
  reason: string,
  ip: string | null,
  details: Record<string, unknown>,
) {
  try {
    await svc().from("security_events").insert({
      event_type: "auth_failed",
      scope: "mpesa-callback",
      ip_address: ip,
      severity: "critical",
      details: { reason, ...details },
    });
  } catch (e) {
    console.error("mpesa-callback security event failure:", e instanceof Error ? e.message : e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }
  const ip = clientIP(req);

  if (req.method !== "POST") {
    await auditRejection("method_not_allowed", ip, { method: req.method });
    return json({ ResultCode: 1, ResultDesc: "Method not allowed" }, 405);
  }

  // 1) Authenticate the caller as Safaricom via the shared callback secret.
  //    Three slots are accepted so rotation is zero-downtime:
  //      current  — steady-state token (signs new pushes)
  //      next     — pre-published token, accepted before cutover
  //      previous — retired token, accepted while in-flight callbacks drain
  const current = Deno.env.get("MPESA_CALLBACK_TOKEN") ?? "";
  const next = Deno.env.get("MPESA_CALLBACK_TOKEN_NEXT") ?? "";
  const previous = Deno.env.get("MPESA_CALLBACK_TOKEN_PREVIOUS") ?? "";
  if (!current && !next && !previous) {
    console.error("mpesa-callback: MPESA_CALLBACK_TOKEN not configured; rejecting");
    await auditRejection("token_not_configured", ip, {});
    return json({ ResultCode: 1, ResultDesc: "Not configured" }, 503);
  }

  const presented = tokenFromRequest(req);
  let matchedSlot: "current" | "next" | "previous" | null = null;
  if (current && safeEqual(presented, current)) matchedSlot = "current";
  else if (next && safeEqual(presented, next)) matchedSlot = "next";
  else if (previous && safeEqual(presented, previous)) matchedSlot = "previous";

  if (!matchedSlot) {
    const reason = presented ? "invalid_token" : "missing_token";
    console.warn(`mpesa-callback: rejected callback (${reason})`);
    await auditRejection(reason, ip, { presented_length: presented.length });
    await securityEvent(reason, ip, { presented_length: presented.length });
    return json({ ResultCode: 1, ResultDesc: "Unauthorized" }, 401);
  }
  if (matchedSlot !== "current") {
    // Observable signal that a rotation window is still in use.
    console.warn(
      `mpesa-callback: accepted with ${matchedSlot.toUpperCase()} token (rotation window open)`,
    );
  }


  try {
    const body = await req.json();
    const cb = body?.Body?.stkCallback;
    if (!cb?.CheckoutRequestID) {
      await auditRejection("malformed_payload", ip, { keys: Object.keys(body ?? {}) });
      // Always ack 0 so Safaricom stops retrying.
      return json({ ResultCode: 0, ResultDesc: "Accepted (no-op)" });
    }

    const supabase = svc();

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

    if (!donation) {
      await auditRejection("unknown_donation", ip, {
        checkout_request_id: cb.CheckoutRequestID,
      });
      return json({ ResultCode: 0, ResultDesc: "Accepted (no pending donation)" });
    }
    if (donation.status !== "pending") {
      await auditRejection(
        "donation_not_pending",
        ip,
        { checkout_request_id: cb.CheckoutRequestID, current_status: donation.status },
        donation.id,
      );
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
        await auditRejection(
          "amount_mismatch",
          ip,
          {
            checkout_request_id: cb.CheckoutRequestID,
            expected_kes: Number(donation.amount_kes),
            paid_kes: Math.round(paidAmount),
          },
          donation.id,
        );
        await securityEvent("amount_mismatch", ip, { donation_id: donation.id });
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
    await auditRejection("processing_error", ip, {
      message: err instanceof Error ? err.message : "unknown",
    });
    // Still return 0 so Safaricom doesn't spam retries.
    return json({ ResultCode: 0, ResultDesc: "Accepted with error" });
  }
});
