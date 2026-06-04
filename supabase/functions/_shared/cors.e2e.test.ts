// Verifies the strict-allowlist CORS contract:
// 1) Unit checks on getCorsHeaders / rejectDisallowedOrigin.
// 2) Live edge-function HTTP checks: disallowed origins receive a 403 on POST
//    and no Access-Control-Allow-Origin reflection on OPTIONS, while the
//    baseline security headers are always present.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getCorsHeaders, isOriginAllowed, rejectDisallowedOrigin } from "./cors.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED_ORIGIN = "https://id-preview--a195f4d5-59f8-49b0-9a16-0b1c51758426.lovable.app";
const EVIL_ORIGIN = "https://evil.example";

const SECURITY_HEADERS = ["x-content-type-options", "x-frame-options", "referrer-policy"];

const FUNCTIONS = [
  "ai-chat",
  "sms-gateway",
  "ussd-handler",
  "emergency-alert",
  "sms-webhook",
  "sms-retry",
  "chw-location-update",
  "send-push-notification",
  "notify-case-update",
  "security-events-export",
  "reports-export",
];

const opts = { sanitizeOps: false, sanitizeResources: false } as const;

// ---------- Unit tests ----------

Deno.test({ ...opts, name: "cors: getCorsHeaders reflects an allowed origin" }, () => {
  const req = new Request("https://x", { headers: { Origin: ALLOWED_ORIGIN } });
  const h = getCorsHeaders(req);
  assertEquals(h["Access-Control-Allow-Origin"], ALLOWED_ORIGIN);
  assertEquals(h["Vary"], "Origin");
  assertEquals(h["X-Content-Type-Options"], "nosniff");
  assertEquals(h["X-Frame-Options"], "DENY");
  assert(h["Referrer-Policy"]);
});

Deno.test({ ...opts, name: "cors: getCorsHeaders does NOT reflect a disallowed origin" }, () => {
  const req = new Request("https://x", { headers: { Origin: EVIL_ORIGIN } });
  const h = getCorsHeaders(req);
  assertEquals(h["Access-Control-Allow-Origin"], undefined);
  assertEquals(h["Vary"], "Origin");
  assertEquals(h["X-Content-Type-Options"], "nosniff");
  assertEquals(h["X-Frame-Options"], "DENY");
});

Deno.test({ ...opts, name: "cors: isOriginAllowed gates correctly" }, () => {
  assert(isOriginAllowed(new Request("https://x", { headers: { Origin: ALLOWED_ORIGIN } })));
  assert(!isOriginAllowed(new Request("https://x", { headers: { Origin: EVIL_ORIGIN } })));
  assert(isOriginAllowed(new Request("https://x"))); // no Origin → same-origin / non-browser
});

Deno.test({ ...opts, name: "cors: rejectDisallowedOrigin returns null on OPTIONS and allowed POST, 403 otherwise" }, async () => {
  assertEquals(rejectDisallowedOrigin(new Request("https://x", { method: "OPTIONS", headers: { Origin: EVIL_ORIGIN } })), null);
  assertEquals(rejectDisallowedOrigin(new Request("https://x", { method: "POST", headers: { Origin: ALLOWED_ORIGIN } })), null);
  const r = rejectDisallowedOrigin(new Request("https://x", { method: "POST", headers: { Origin: EVIL_ORIGIN } }));
  assert(r);
  assertEquals(r!.status, 403);
  const json = await r!.json();
  assertEquals(json.error, "Origin not allowed");
  for (const h of SECURITY_HEADERS) {
    assert(r!.headers.get(h), `missing ${h}`);
  }
});

// ---------- Live HTTP checks (skipped if SUPABASE_URL is missing) ----------

const LIVE = !!SUPABASE_URL && !!ANON_KEY;

for (const fn of FUNCTIONS) {
  const url = `${SUPABASE_URL}/functions/v1/${fn}`;

  Deno.test({
    ...opts,
    name: `cors live: ${fn} OPTIONS from evil origin has no Allow-Origin reflection + security headers`,
    ignore: !LIVE,
  }, async () => {
    const res = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: EVIL_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type",
        apikey: ANON_KEY,
      },
    });
    await res.text();
    assert(res.status >= 200 && res.status < 400, `unexpected status ${res.status}`);
    assertEquals(res.headers.get("access-control-allow-origin"), null);
    for (const h of SECURITY_HEADERS) {
      assert(res.headers.get(h), `${fn} missing ${h} on OPTIONS`);
    }
  });

  Deno.test({
    ...opts,
    name: `cors live: ${fn} POST from evil origin → 403 with security headers`,
    ignore: !LIVE,
  }, async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Origin: EVIL_ORIGIN,
        "Content-Type": "application/json",
        apikey: ANON_KEY,
      },
      body: "{}",
    });
    const text = await res.text();
    assertEquals(res.status, 403, `${fn} expected 403, got ${res.status}: ${text.slice(0, 120)}`);
    for (const h of SECURITY_HEADERS) {
      assert(res.headers.get(h), `${fn} missing ${h} on 403`);
    }
    try {
      assertEquals(JSON.parse(text).error, "Origin not allowed");
    } catch {
      throw new Error(`${fn} 403 body not JSON: ${text.slice(0, 120)}`);
    }
  });

  Deno.test({
    ...opts,
    name: `cors live: ${fn} OPTIONS from allowed origin reflects Allow-Origin`,
    ignore: !LIVE,
  }, async () => {
    const res = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type",
        apikey: ANON_KEY,
      },
    });
    await res.text();
    assertEquals(res.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
  });
}
