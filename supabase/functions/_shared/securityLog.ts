// Durable logger for security events. Uses service role.
// Provides three entry points:
//   - logSecurityEvent(ev)         fire-and-forget; tracked in `pending` so
//                                  withSecurityEventFlush / flushSecurityEvents
//                                  can drain before the isolate shuts down.
//   - logSecurityEventSync(ev)     awaited insert with 1 retry + fallback log.
//                                  Use for hot-path denials (429, validation)
//                                  where the caller returns immediately after.
//   - withSecurityEventFlush(fn)   handler wrapper that always awaits pending
//                                  inserts before returning the Response.
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

function buildRow(ev: SecurityEvent) {
  return {
    event_type: ev.event_type,
    scope: ev.scope ?? null,
    ip_address: ev.ip_address ?? null,
    user_id: ev.user_id ?? null,
    details: ev.details ?? {},
    severity: ev.severity ?? "info",
  };
}

async function insertOnce(ev: SecurityEvent): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await client().from("security_events").insert(buildRow(ev));
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); },
          (e) => { clearTimeout(t); reject(e); });
  });
}

/** Fire-and-forget log; drain via flushSecurityEvents / withSecurityEventFlush. */
export function logSecurityEvent(ev: SecurityEvent): void {
  try {
    const p: Promise<void> = (async () => {
      const r = await insertOnce(ev);
      if (!r.ok) console.error("SECURITY_EVENT_FALLBACK", JSON.stringify({ ...ev, error: r.error }));
    })();
    pending.add(p);
    p.finally(() => pending.delete(p));
  } catch (e) {
    console.error("SECURITY_EVENT_FALLBACK sync", e instanceof Error ? e.message : "unknown");
  }
}

/** Awaited insert with one retry + structured fallback log. Never throws. */
export async function logSecurityEventSync(ev: SecurityEvent): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await withTimeout(insertOnce(ev), 1500, "security_event_insert");
      if (r.ok) return;
      if (attempt === 1) {
        console.error("SECURITY_EVENT_FALLBACK", JSON.stringify({ ...ev, error: r.error }));
      }
    } catch (e) {
      if (attempt === 1) {
        console.error(
          "SECURITY_EVENT_FALLBACK",
          JSON.stringify({ ...ev, error: e instanceof Error ? e.message : "unknown" }),
        );
      }
    }
  }
}

/** Drain in-flight log inserts. */
export async function flushSecurityEvents(): Promise<void> {
  if (pending.size === 0) return;
  await Promise.allSettled([...pending]);
}

/** Wrap a Deno.serve handler so pending security_events inserts drain before response. */
export function withSecurityEventFlush(
  handler: (req: Request) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      const res = await handler(req);
      return res;
    } finally {
      try { await flushSecurityEvents(); } catch { /* best-effort */ }
    }
  };
}

/** SHA-256 hex of an arbitrary string. Used to hash phone numbers before logging. */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
