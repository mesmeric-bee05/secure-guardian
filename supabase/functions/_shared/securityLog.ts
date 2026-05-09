// Fire-and-forget logger for security events. Uses service role.
// In tests, awaits via flushSecurityEvents() so resource sanitizers stay green.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

let cached: SupabaseClient | null = null;
function client() {
  if (cached) return cached;
  cached = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
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

const pending = new Set<Promise<unknown>>();

export function logSecurityEvent(ev: SecurityEvent): void {
  try {
    const insert = client()
      .from("security_events")
      .insert({
        event_type: ev.event_type,
        scope: ev.scope ?? null,
        ip_address: ev.ip_address ?? null,
        user_id: ev.user_id ?? null,
        details: ev.details ?? {},
        severity: ev.severity ?? "info",
      });
    const p: Promise<void> = (async () => {
      try {
        const { error } = await insert;
        if (error) console.error("security_event insert error:", error.message);
      } catch (e) {
        console.error("security_event threw:", e instanceof Error ? e.message : "unknown");
      }
    })();
    pending.add(p);
    p.finally(() => pending.delete(p));
  } catch (e) {
    console.error("security_event sync threw:", e instanceof Error ? e.message : "unknown");
  }
}

/** Drain in-flight log inserts. Call from tests to keep Deno's sanitizers happy. */
export async function flushSecurityEvents(): Promise<void> {
  if (pending.size === 0) return;
  await Promise.allSettled([...pending]);
}
