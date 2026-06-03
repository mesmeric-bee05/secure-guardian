// Admin-only streaming CSV export of security_events with active filters.
// Auth: Bearer JWT, then is_admin() RPC. Rate-limited. Hard cap 50k rows.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "https://esm.sh/zod@3.23.8";
import { getCorsHeaders, getClientIP, rejectDisallowedOrigin } from "../_shared/cors.ts";
import { enforceLimits } from "../_shared/rateLimit.ts";
import { parseBody, badRequest } from "../_shared/validation.ts";
import { logSecurityEvent } from "../_shared/securityLog.ts";

const MAX_ROWS = 50_000;
const BATCH = 1_000;

const BodySchema = z.object({
  since: z.string().datetime(),
  eventType: z.enum(["rate_limit_429", "validation_failed", "suspicious", "auth_failed"]).optional(),
  severity: z.enum(["info", "warn", "critical"]).optional(),
  scopeContains: z.string().trim().max(120).optional(),
  ipContains: z.string().trim().max(64).optional(),
  userId: z.string().uuid().optional(),
}).strict();

const CSV_HEADERS = ["created_at", "event_type", "scope", "severity", "ip_address", "user_id", "details"];

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  return `"${s.replace(/"/g, '""')}"`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ip = getClientIP(req);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logSecurityEvent({ event_type: "auth_failed", scope: "security-events-export", ip_address: ip, severity: "warn", details: { reason: "missing_bearer" } });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      logSecurityEvent({ event_type: "auth_failed", scope: "security-events-export", ip_address: ip, severity: "warn", details: { reason: "invalid_token" } });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    // Rate limit
    const limited = await enforceLimits({
      scope: "security-events-export", ip, userId,
      ipLimitPerMin: 5, userLimitPerMin: 10, corsHeaders,
    });
    if (limited) return limited;

    const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Admin gate
    const { data: isAdmin, error: roleErr } = await svc.rpc("is_admin", { _user_id: userId });
    if (roleErr || !isAdmin) {
      logSecurityEvent({ event_type: "auth_failed", scope: "security-events-export", ip_address: ip, user_id: userId, severity: "critical", details: { reason: "not_admin" } });
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = await parseBody(req, BodySchema);
    if (!parsed.ok || !parsed.data) {
      return badRequest(parsed.error!, corsHeaders, { scope: "security-events-export", ip, userId }, parsed.issues);
    }
    const f = parsed.data;

    const buildQuery = (cursor: { ts: string; id: string } | null) => {
      let q = svc.from("security_events").select("*").gte("created_at", f.since);
      if (f.eventType) q = q.eq("event_type", f.eventType);
      if (f.severity) q = q.eq("severity", f.severity);
      if (f.scopeContains) q = q.ilike("scope", `%${f.scopeContains}%`);
      if (f.ipContains) q = q.ilike("ip_address", `%${f.ipContains}%`);
      if (f.userId) q = q.eq("user_id", f.userId);
      if (cursor) {
        q = q.or(`created_at.lt.${cursor.ts},and(created_at.eq.${cursor.ts},id.lt.${cursor.id})`);
      }
      return q.order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(BATCH);
    };

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const responseHeaders = {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="security-events-${stamp}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };

    let totalRows = 0;
    let truncated = false;
    let cursor: { ts: string; id: string } | null = null;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(CSV_HEADERS.join(",") + "\n"));
          while (totalRows < MAX_ROWS) {
            const { data, error } = await buildQuery(cursor);
            if (error) {
              controller.enqueue(encoder.encode(`# error: ${error.message}\n`));
              break;
            }
            if (!data || data.length === 0) break;
            for (const r of data) {
              if (totalRows >= MAX_ROWS) { truncated = true; break; }
              controller.enqueue(encoder.encode([
                csvEscape(r.created_at),
                csvEscape(r.event_type),
                csvEscape(r.scope),
                csvEscape(r.severity),
                csvEscape(r.ip_address),
                csvEscape(r.user_id),
                csvEscape(r.details),
              ].join(",") + "\n"));
              totalRows++;
              cursor = { ts: r.created_at, id: r.id };
            }
            if (data.length < BATCH) break;
          }
          if (truncated) {
            controller.enqueue(encoder.encode(`# truncated_at_max_rows=${MAX_ROWS}\n`));
          }
          controller.close();
          // Audit log (fire-and-forget)
          svc.from("audit_logs").insert({
            user_id: userId,
            action: "security_events_export",
            resource_type: "security_events",
            ip_address: ip,
            details: { ...f, row_count: totalRows, truncated },
          }).then(({ error }) => { if (error) console.error("audit_logs insert:", error.message); });
        } catch (e) {
          console.error("export stream error:", e instanceof Error ? e.message : "unknown");
          try { controller.error(e); } catch { /* noop */ }
        }
      },
    });

    return new Response(stream, { status: 200, headers: responseHeaders });
  } catch (e) {
    console.error("security-events-export fatal:", e instanceof Error ? e.message : "unknown");
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
