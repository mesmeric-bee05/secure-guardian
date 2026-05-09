// Integration test: rate limiter returns 429 with proper Retry-After + headers.
// Run via supabase--test_edge_functions tool.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enforceLimits, consume } from "../_shared/rateLimit.ts";
import { flushSecurityEvents } from "../_shared/securityLog.ts";

const CORS = { "Access-Control-Allow-Origin": "*" };

Deno.test("token bucket: first call allowed, then refills", async () => {
  const key = `test:bucket:${crypto.randomUUID()}`;
  const r1 = await consume(key, { capacity: 2, refillPerSec: 0.001 });
  assert(r1.allowed, "first call should be allowed");
  const r2 = await consume(key, { capacity: 2, refillPerSec: 0.001 });
  assert(r2.allowed, "second call should be allowed (capacity 2)");
  const r3 = await consume(key, { capacity: 2, refillPerSec: 0.001 });
  assertEquals(r3.allowed, false, "third call should be denied");
  assert(r3.retryAfterSeconds > 0, "retryAfter should be positive");
  await flushSecurityEvents();
});

Deno.test("enforceLimits: returns null when under quota", async () => {
  const ip = `127.0.0.${Math.floor(Math.random() * 254) + 1}`;
  const res = await enforceLimits({
    scope: `test-scope-${crypto.randomUUID()}`,
    ip,
    ipLimitPerMin: 10,
    corsHeaders: CORS,
  });
  assertEquals(res, null);
  await flushSecurityEvents();
});

Deno.test("enforceLimits: 429 response has Retry-After + X-RateLimit-* headers", async () => {
  const scope = `test-429-${crypto.randomUUID()}`;
  const ip = "10.0.0.1";
  await enforceLimits({ scope, ip, ipLimitPerMin: 1, corsHeaders: CORS });
  const res = await enforceLimits({ scope, ip, ipLimitPerMin: 1, corsHeaders: CORS });
  assert(res !== null, "second call should be blocked");
  assertEquals(res!.status, 429);
  const retry = res!.headers.get("Retry-After");
  const remaining = res!.headers.get("X-RateLimit-Remaining");
  const limit = res!.headers.get("X-RateLimit-Limit");
  assert(retry !== null, "Retry-After header missing");
  assert(Number(retry) > 0, "Retry-After must be > 0");
  assert(remaining !== null, "X-RateLimit-Remaining header missing");
  assertEquals(limit, "1");
  const body = await res!.json();
  assertEquals(typeof body.retry_after_seconds, "number");
  assertEquals(typeof body.error, "string");
  await flushSecurityEvents();
});

Deno.test("enforceLimits: user bucket independent of IP bucket", async () => {
  const scope = `test-user-${crypto.randomUUID()}`;
  const userId = crypto.randomUUID();
  await enforceLimits({ scope, ip: "10.0.0.2", userId, ipLimitPerMin: 100, userLimitPerMin: 1, corsHeaders: CORS });
  const res = await enforceLimits({ scope, ip: "10.0.0.2", userId, ipLimitPerMin: 100, userLimitPerMin: 1, corsHeaders: CORS });
  assert(res !== null, "user-bucket exhaustion should 429");
  assertEquals(res!.status, 429);
  await flushSecurityEvents();
});
