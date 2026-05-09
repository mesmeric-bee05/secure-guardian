// Postgres-backed durable token-bucket rate limiter shared across all
// edge function instances. Survives cold starts.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { logSecurityEvent } from "./securityLog.ts";

export interface RateLimitConfig {
  /** Bucket capacity (max burst). */
  capacity: number;
  /** Refill rate in tokens per second. Use capacity / 60 for "N per minute". */
  refillPerSec: number;
  /** Cost per request, default 1. */
  cost?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

let cachedClient: SupabaseClient | null = null;
function getServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  cachedClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return cachedClient;
}

/** Consume one token from the named bucket. Fails open on DB errors. */
export async function consume(
  bucketKey: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc('consume_rate_limit', {
      _key: bucketKey,
      _capacity: config.capacity,
      _refill_per_sec: config.refillPerSec,
      _cost: config.cost ?? 1,
    });
    if (error || !data) {
      console.error('rate_limit rpc error:', error?.message);
      return { allowed: true, remaining: config.capacity, retryAfterSeconds: 0 };
    }
    const d = data as { allowed: boolean; remaining: number; retry_after_seconds: number };
    return {
      allowed: d.allowed,
      remaining: d.remaining,
      retryAfterSeconds: d.retry_after_seconds,
    };
  } catch (e) {
    console.error('rate_limit threw:', e instanceof Error ? e.message : 'unknown');
    return { allowed: true, remaining: config.capacity, retryAfterSeconds: 0 };
  }
}

/**
 * Enforce IP+user limits. If either bucket denies, return a 429 Response.
 * Returns null when the request is allowed.
 */
export async function enforceLimits(opts: {
  scope: string;
  ip: string;
  userId?: string | null;
  ipLimitPerMin: number;
  userLimitPerMin?: number;
  corsHeaders: Record<string, string>;
}): Promise<Response | null> {
  const checks: Promise<RateLimitResult>[] = [
    consume(`${opts.scope}:ip:${opts.ip}`, {
      capacity: opts.ipLimitPerMin,
      refillPerSec: opts.ipLimitPerMin / 60,
    }),
  ];
  if (opts.userId && opts.userLimitPerMin) {
    checks.push(
      consume(`${opts.scope}:user:${opts.userId}`, {
        capacity: opts.userLimitPerMin,
        refillPerSec: opts.userLimitPerMin / 60,
      }),
    );
  }
  const results = await Promise.all(checks);
  const blocked = results.find((r) => !r.allowed);
  if (!blocked) return null;
  const retry = Math.max(1, Math.ceil(blocked.retryAfterSeconds));
  logSecurityEvent({
    event_type: "rate_limit_429",
    scope: opts.scope,
    ip_address: opts.ip,
    user_id: opts.userId ?? null,
    details: { retry_after_seconds: retry, remaining: blocked.remaining },
    severity: "warn",
  });
  return new Response(
    JSON.stringify({
      error: 'Rate limit exceeded. Please try again shortly.',
      retry_after_seconds: retry,
    }),
    {
      status: 429,
      headers: {
        ...opts.corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(retry),
        'X-RateLimit-Remaining': String(Math.max(0, blocked.remaining)),
        'X-RateLimit-Limit': String(opts.ipLimitPerMin),
      },
    },
  );
}
