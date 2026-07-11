// Admin-only streaming CSV export for the Reports page.
// Supported datasets: cases, sms, security, protocols.
// Auth: Bearer JWT + is_admin(). Rate-limited (5/min/IP, 10/min/user).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "https://esm.sh/zod@3.23.8";
import { getCorsHeaders, getClientIP, rejectDisallowedOrigin } from "../_shared/cors.ts";
import { enforceLimits } from "../_shared/rateLimit.ts";
import { parseBody, badRequest } from "../_shared/validation.ts";
import { logSecurityEvent } from "../_shared/securityLog.ts";
import { classifyClaims, logJwtFailure } from "../_shared/authLog.ts";

const MAX_ROWS = 50_000;
const BATCH = 1_000;

const BodySchema = z.object({
  dataset: z.enum(["cases", "sms", "security", "protocols"]),
  since: z.string().datetime(),
  until: z.string().datetime().optional(),
}).strict();

type Dataset = z.infer<typeof BodySchema>["dataset"];

const DATASET_CONFIG: Record<Dataset, { table: string; columns: string[]; timeCol: string }> = {
  cases:     { table: "emergency_cases",  columns: ["id","user_id","assigned_chw_id","symptoms","priority","status","location_address","created_at","resolved_at","updated_at"], timeCol: "created_at" },
  sms:       { table: "sms_logs",         columns: ["id","direction","from_number","to_number","status","message_preview","provider_message_id","error_message","created_at"], timeCol: "created_at" },
  security:  { table: "security_events",  columns: ["id","event_type","scope","severity","ip_address","user_id","details","created_at"], timeCol: "created_at" },
  protocols: { table: "first_aid_protocols", columns: ["id","category","title_en","title_sw","severity","red_flags_en","red_flags_sw","seek_help_en","seek_help_sw","video_url","video_provider","updated_at"], timeCol: "updated_at" },
};

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  return `"${s.replace(/"/g, '""')}"`;
}

async function safeAudit(svc: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  try {
    await svc.from("audit_logs").insert(payload);
  } catch (e) {
    console.error("audit_logs insert failed:", e instanceof Error ? e.message : "unknown");
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const originRejection = rejectDisallowedOrigin(req);
  if (originRejection) return originRejection;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ip = getClientIP(req);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logJwtFailure({ fn: "reports-export", reason: "missing_bearer", authHeader, ip });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub || claims.claims.role !== "authenticated") {
      logJwtFailure({ fn: "reports-export", reason: classifyClaims(claimsError, claims), authHeader, claims: claims?.claims, ip });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const limited = await enforceLimits({
      scope: "reports-export", ip, userId,
      ipLimitPerMin: 5, userLimitPerMin: 10, corsHeaders,
    });
    if (limited) return limited;

    const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: isAdmin, error: roleErr } = await svc.rpc("is_admin", { _user_id: userId });
    if (roleErr || !isAdmin) {
      logSecurityEvent({ event_type: "auth_failed", scope: "reports-export", ip_address: ip, user_id: userId, severity: "critical", details: { reason: "not_admin" } });
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = await parseBody(req, BodySchema);
    if (!parsed.ok || !parsed.data) {
      return badRequest(parsed.error!, corsHeaders, { scope: "reports-export", ip, userId }, parsed.issues);
    }
    const { dataset, since, until } = parsed.data;
    const cfg = DATASET_CONFIG[dataset];

    // Audit export attempt start (do not block on failure)
    safeAudit(svc, {
      user_id: userId, action: "reports_export_start", resource_type: dataset,
      ip_address: ip, details: { since, until: until ?? null },
    });

    const stamp = new Date().toISOString().split("T")[0];
    const responseHeaders = {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${dataset}-${stamp}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };

    const encoder = new TextEncoder();
    let totalRows = 0;
    let truncated = false;
    let lastTs: string | null = null;
    let lastId: string | null = null;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(cfg.columns.join(",") + "\n"));
          while (totalRows < MAX_ROWS) {
            let q = svc.from(cfg.table).select(cfg.columns.join(",")).gte(cfg.timeCol, since);
            if (until) q = q.lte(cfg.timeCol, until);
            if (lastTs && lastId) {
              q = q.or(`${cfg.timeCol}.lt.${lastTs},and(${cfg.timeCol}.eq.${lastTs},id.lt.${lastId})`);
            }
            q = q.order(cfg.timeCol, { ascending: false }).order("id", { ascending: false }).limit(BATCH);
            const { data, error } = await q;
            if (error) {
              controller.enqueue(encoder.encode(`# error: ${error.message}\n`));
              break;
            }
            if (!data || data.length === 0) break;
            for (const r of data as Record<string, unknown>[]) {
              if (totalRows >= MAX_ROWS) { truncated = true; break; }
              controller.enqueue(encoder.encode(cfg.columns.map((c) => csvEscape(r[c])).join(",") + "\n"));
              totalRows++;
              lastTs = String(r[cfg.timeCol]);
              lastId = String(r["id"]);
            }
            if (data.length < BATCH) break;
          }
          if (truncated) {
            controller.enqueue(encoder.encode(`# truncated_at_max_rows=${MAX_ROWS}\n`));
          }
          controller.close();
          safeAudit(svc, {
            user_id: userId, action: "reports_export_complete", resource_type: dataset,
            ip_address: ip, details: { since, until: until ?? null, row_count: totalRows, truncated },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          console.error("reports-export stream error:", msg);
          safeAudit(svc, {
            user_id: userId, action: "reports_export_error", resource_type: dataset,
            ip_address: ip, details: { since, until: until ?? null, row_count: totalRows, error: msg },
          });
          try { controller.error(e); } catch { /* noop */ }
        }
      },
      cancel() {
        safeAudit(svc, {
          user_id: userId, action: "reports_export_cancel", resource_type: dataset,
          ip_address: ip, details: { since, until: until ?? null, row_count: totalRows },
        });
      },
    });

    return new Response(stream, { status: 200, headers: responseHeaders });
  } catch (e) {
    console.error("reports-export fatal:", e instanceof Error ? e.message : "unknown");
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
