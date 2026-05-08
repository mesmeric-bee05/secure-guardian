// E2E test: confirm every public endpoint's rate-limit contract returns
// a graceful 429 with Retry-After + X-RateLimit-* headers and a JSON body
// containing retry_after_seconds + error. Each endpoint shares
// `enforceLimits`, so we simulate per-endpoint scopes with unique IPs.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enforceLimits } from "../_shared/rateLimit.ts";

const CORS = { "Access-Control-Allow-Origin": "*" };

const ENDPOINTS = [
  { scope: "ai-chat", ipLimitPerMin: 20, userLimitPerMin: 30 },
  { scope: "emergency-alert", ipLimitPerMin: 10, userLimitPerMin: 15 },
  { scope: "chw-location-update", ipLimitPerMin: 60, userLimitPerMin: 2 },
  { scope: "sms-webhook", ipLimitPerMin: 60 },
  { scope: "ussd-ip", ipLimitPerMin: 120 },
  { scope: "send-push", ipLimitPerMin: 60 },
  { scope: "sms-gateway", ipLimitPerMin: 10, userLimitPerMin: 20 },
  { scope: "sms-retry", ipLimitPerMin: 10, userLimitPerMin: 5 },
  { scope: "notify-case-update", ipLimitPerMin: 30, userLimitPerMin: 30 },
];

for (const ep of ENDPOINTS) {
  Deno.test(`429 contract: ${ep.scope}`, async () => {
    const ip = `10.99.${Math.floor(Math.random() * 254)}.${Math.floor(Math.random() * 254)}`;
    // Drain the bucket
    let blocked: Response | null = null;
    for (let i = 0; i < ep.ipLimitPerMin + 2; i++) {
      const res = await enforceLimits({
        scope: ep.scope,
        ip,
        ipLimitPerMin: ep.ipLimitPerMin,
        userLimitPerMin: ep.userLimitPerMin,
        corsHeaders: CORS,
      });
      if (res) { blocked = res; break; }
    }
    assert(blocked, `${ep.scope}: should produce a 429 after exceeding ${ep.ipLimitPerMin}/min`);
    assertEquals(blocked!.status, 429);

    const retry = blocked!.headers.get("Retry-After");
    const remaining = blocked!.headers.get("X-RateLimit-Remaining");
    const limit = blocked!.headers.get("X-RateLimit-Limit");
    assert(retry !== null, "Retry-After header missing");
    assert(Number(retry) > 0, "Retry-After must be > 0");
    assert(remaining !== null, "X-RateLimit-Remaining header missing");
    assertEquals(limit, String(ep.ipLimitPerMin));

    const body = await blocked!.json();
    assertEquals(typeof body.retry_after_seconds, "number");
    assertEquals(typeof body.error, "string");
    assert(body.error.length > 0, "error message should be non-empty");
  });
}
