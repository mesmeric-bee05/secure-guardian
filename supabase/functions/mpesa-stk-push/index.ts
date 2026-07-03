// M-PESA Daraja STK Push initiator.
// Deno / Supabase Edge Function. verify_jwt=false; JWT verified in code.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "https://esm.sh/zod@3.23.8";
import { getClientIP, getCorsHeaders, rejectDisallowedOrigin } from "../_shared/cors.ts";
import { enforceLimits } from "../_shared/rateLimit.ts";

const BodySchema = z.object({
  amount: z.number().int().min(10).max(70000),
  phone: z
    .string()
    .regex(/^2547\d{8}$/, "Phone must be in 2547XXXXXXXX format"),
  reference: z.string().max(20).optional(),
});

function encode(v: string) {
  return btoa(v);
}

async function getDarajaToken(env: Record<string, string>) {
  const url =
    env.MPESA_ENV === "production"
      ? "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
      : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
  const creds = encode(`${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`);
  const res = await fetch(url, { headers: { Authorization: `Basic ${creds}` } });
  if (!res.ok) throw new Error(`Daraja auth failed: ${res.status}`);
  const j = await res.json();
  return j.access_token as string;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const originRejection = rejectDisallowedOrigin(req);
  if (originRejection) return originRejection;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const rateLimited = await enforceLimits({
      scope: "mpesa-stk",
      ip: getClientIP(req),
      userId,
      ipLimitPerMin: 10,
      userLimitPerMin: 5,
      corsHeaders,
    });
    if (rateLimited) return rateLimited;

    // Input
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const { amount, phone, reference } = parsed.data;

    // M-PESA config
    const env: Record<string, string> = {
      MPESA_CONSUMER_KEY: Deno.env.get("MPESA_CONSUMER_KEY") ?? "",
      MPESA_CONSUMER_SECRET: Deno.env.get("MPESA_CONSUMER_SECRET") ?? "",
      MPESA_SHORTCODE: Deno.env.get("MPESA_SHORTCODE") ?? "",
      MPESA_PASSKEY: Deno.env.get("MPESA_PASSKEY") ?? "",
      MPESA_CALLBACK_URL: Deno.env.get("MPESA_CALLBACK_URL") ?? "",
      MPESA_ENV: Deno.env.get("MPESA_ENV") ?? "sandbox",
    };

    const missing = Object.entries(env)
      .filter(([k, v]) => k !== "MPESA_ENV" && !v)
      .map(([k]) => k);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    if (missing.length) {
      return new Response(
        JSON.stringify({
          error: "mpesa_not_configured",
          message:
            "M-PESA is not configured yet. Please contact an administrator to enable donations.",
          missing,
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const token = await getDarajaToken(env);
    const timestamp = new Date()
      .toISOString()
      .replace(/[-T:.Z]/g, "")
      .slice(0, 14);
    const password = encode(`${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY}${timestamp}`);

    const baseUrl =
      env.MPESA_ENV === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

    const stkRes = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: env.MPESA_SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: env.MPESA_CALLBACK_URL,
        AccountReference: (reference || "MediReachPlus").slice(0, 12),
        TransactionDesc: "MediReach+ donation",
      }),
    });
    const stkJson = await stkRes.json();
    if (!stkRes.ok || stkJson.ResponseCode !== "0") {
      return new Response(
        JSON.stringify({
          error: "stk_push_failed",
          detail: stkJson,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    await admin.from("donations").insert({
      user_id: userId,
      amount_kes: amount,
      phone_msisdn: phone,
      status: "pending",
      checkout_request_id: stkJson.CheckoutRequestID,
      merchant_request_id: stkJson.MerchantRequestID,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        checkout_request_id: stkJson.CheckoutRequestID,
        message: "STK push sent. Check your phone to complete the donation.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("mpesa-stk-push error", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
