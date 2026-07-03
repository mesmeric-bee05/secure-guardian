// M-PESA configuration checklist. Admin-only. verify_jwt=false (JWT verified in code).
// Returns per-var { set, valid, hint } — NEVER leaks secret values.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getCorsHeaders, rejectDisallowedOrigin } from "../_shared/cors.ts";

type CheckRow = {
  name: string;
  set: boolean;
  valid: boolean;
  hint: string;
};

function checkVars(env: Record<string, string | undefined>): CheckRow[] {
  const rows: CheckRow[] = [];
  const push = (
    name: string,
    validate: (v: string) => { ok: boolean; hint: string },
  ) => {
    const v = env[name] ?? "";
    if (!v) {
      rows.push({ name, set: false, valid: false, hint: "Not set" });
      return;
    }
    const r = validate(v);
    rows.push({ name, set: true, valid: r.ok, hint: r.hint });
  };

  push("MPESA_CONSUMER_KEY", (v) => ({
    ok: v.length >= 20,
    hint: v.length >= 20 ? "OK" : "Expected ≥20 chars",
  }));
  push("MPESA_CONSUMER_SECRET", (v) => ({
    ok: v.length >= 20,
    hint: v.length >= 20 ? "OK" : "Expected ≥20 chars",
  }));
  push("MPESA_SHORTCODE", (v) => ({
    ok: /^\d{5,7}$/.test(v),
    hint: /^\d{5,7}$/.test(v) ? "OK" : "Must be 5–7 digits",
  }));
  push("MPESA_PASSKEY", (v) => ({
    ok: v.length >= 40,
    hint: v.length >= 40 ? "OK" : "Expected ≥40 chars",
  }));
  push("MPESA_CALLBACK_URL", (v) => ({
    ok: /^https:\/\//i.test(v),
    hint: /^https:\/\//i.test(v) ? "OK" : "Must be https URL",
  }));
  push("MPESA_ENV", (v) => ({
    ok: v === "sandbox" || v === "production",
    hint: v === "sandbox" || v === "production" ? v : "Must be sandbox|production",
  }));
  return rows;
}

async function probeDaraja(env: Record<string, string | undefined>) {
  const key = env.MPESA_CONSUMER_KEY;
  const secret = env.MPESA_CONSUMER_SECRET;
  const mode = env.MPESA_ENV;
  if (!key || !secret || !mode) return { ok: false, error: "credentials_missing" };
  const url =
    mode === "production"
      ? "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
      : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
  try {
    const creds = btoa(`${key}:${secret}`);
    const res = await fetch(url, { headers: { Authorization: `Basic ${creds}` } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j?.access_token) {
      return { ok: false, error: `daraja_${res.status}` };
    }
    return { ok: true, expires_in: Number(j.expires_in ?? 3599) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const originRejection = rejectDisallowedOrigin(req);
  if (originRejection) return originRejection;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const publicMode = !authHeader; // allow unauth read-only checklist (booleans only)

    let isAdmin = false;
    let userId: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims } = await userClient.auth.getClaims(
        authHeader.replace("Bearer ", ""),
      );
      userId = (claims?.claims?.sub as string) ?? null;
      if (userId) {
        const { data: adminFlag } = await userClient.rpc("is_admin", {
          _user_id: userId,
        });
        isAdmin = adminFlag === true;
      }
    }

    const env = {
      MPESA_CONSUMER_KEY: Deno.env.get("MPESA_CONSUMER_KEY"),
      MPESA_CONSUMER_SECRET: Deno.env.get("MPESA_CONSUMER_SECRET"),
      MPESA_SHORTCODE: Deno.env.get("MPESA_SHORTCODE"),
      MPESA_PASSKEY: Deno.env.get("MPESA_PASSKEY"),
      MPESA_CALLBACK_URL: Deno.env.get("MPESA_CALLBACK_URL"),
      MPESA_ENV: Deno.env.get("MPESA_ENV"),
    };

    const rows = checkVars(env);
    const allValid = rows.every((r) => r.set && r.valid);
    const ready = allValid;

    // Public callers get booleans only; admins additionally get a live Daraja probe.
    const probe = isAdmin ? await probeDaraja(env) : undefined;

    const payload = publicMode || !isAdmin
      ? { ready, mode: env.MPESA_ENV ?? "unset" }
      : {
          ready,
          mode: env.MPESA_ENV ?? "unset",
          checks: rows,
          probe,
          verified_at: new Date().toISOString(),
        };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ready: false, error: (e as Error).message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
