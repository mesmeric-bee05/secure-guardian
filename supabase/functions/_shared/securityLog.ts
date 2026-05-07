// Fire-and-forget logger for security events. Uses service role.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

let cached: SupabaseClient | null = null;
function client() {
  if (cached) return cached;
  cached = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  return cached;
}

export type SecurityEventType =
  | "rate_limit_429"
  | "validation_failed"
  | "suspicious"
  | "auth_failed";

export interface SecurityEvent {
  event_type: SecurityEventType;
  scope?: string;
  ip_address?: string | null;
  user_id?: string | null;
  details?: Record<string, unknown>;
  severity?: "info" | "warn" | "critical";
}

export function logSecurityEvent(ev: SecurityEvent): void {
  // Don't await — fire and forget so request latency isn't impacted.
  try {
    client()
      .from("security_events")
      .insert({
        event_type: ev.event_type,
        scope: ev.scope ?? null,
        ip_address: ev.ip_address ?? null,
        user_id: ev.user_id ?? null,
        details: ev.details ?? {},
        severity: ev.severity ?? "info",
      })
      .then(({ error }) => {
        if (error) console.error("security_event insert error:", error.message);
      });
  } catch (e) {
    console.error("security_event threw:", e instanceof Error ? e.message : "unknown");
  }
}
