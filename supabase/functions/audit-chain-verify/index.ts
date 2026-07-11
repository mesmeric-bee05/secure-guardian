// Admin-only endpoint to verify the audit-log hash chain (tamper-evidence).
// Wraps the SECURITY DEFINER RPC public.admin_verify_audit_chain.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "https://esm.sh/zod@3.23.8";
import { getCorsHeaders, getClientIP, rejectDisallowedOrigin } from "../_shared/cors.ts";
import { enforceLimits } from "../_shared/rateLimit.ts";
import { logSecurityEvent } from "../_shared/securityLog.ts";
import { classifyClaims, logJwtFailure } from "../_shared/authLog.ts";

const BodySchema = z
  .object({
    from: z.number().int().nonnegative().optional(),
    to: z.number().int().positive().optional(),
  })
  .strict();

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
    const ip = getClientIP(req);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logJwtFailure({ fn: "audit-chain-verify", reason: "missing_bearer", authHeader, ip });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub || claims.claims.role !== "authenticated") {
      logJwtFailure({ fn: "audit-chain-verify", reason: classifyClaims(claimsError, claims), authHeader, claims: claims?.claims, ip });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const limited = await enforceLimits({
      scope: "audit-chain-verify",
      ip,
      userId,
      ipLimitPerMin: 6,
      userLimitPerMin: 12,
      corsHeaders,
    });
    if (limited) return limited;

    // Parse optional body
    let parsed: z.infer<typeof BodySchema> = {};
    if (req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0) {
      const raw = await req.json().catch(() => ({}));
      const res = BodySchema.safeParse(raw);
      if (!res.success) {
        return new Response(
          JSON.stringify({ error: "Invalid body", details: res.error.flatten().fieldErrors }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      parsed = res.data;
    }

    // Call admin RPC using user JWT — function enforces is_admin() internally.
    const { data, error } = await supabaseAuth.rpc("admin_verify_audit_chain", {
      _from: parsed.from ?? 0,
      _to: parsed.to ?? null,
    });

    if (error) {
      const forbidden = /forbidden/i.test(error.message);
      logSecurityEvent({
        event_type: forbidden ? "auth_failed" : "validation_failed",
        scope: "audit-chain-verify",
        ip_address: ip,
        user_id: userId,
        severity: forbidden ? "warn" : "critical",
        details: { error: error.message },
      });
      return new Response(
        JSON.stringify({ error: forbidden ? "Forbidden" : "Verification failed" }),
        {
          status: forbidden ? 403 : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify(data ?? {}), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
