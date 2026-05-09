// Integration test: schema-validation failures must yield 400 with JSON error
// AND insert a security_events row with event_type='validation_failed'.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { z } from "https://esm.sh/zod@3.23.8";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { parseBody, badRequest } from "../_shared/validation.ts";
import { flushSecurityEvents } from "../_shared/securityLog.ts";

const CORS = { "Access-Control-Allow-Origin": "*" };

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function waitForEvent(scope: string, sinceIso: string, timeoutMs = 6000) {
  const supabase = svc();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabase
      .from("security_events")
      .select("*")
      .eq("event_type", "validation_failed")
      .eq("scope", scope)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data && data.length) return data[0];
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

const CASES = [
  {
    name: "ai-chat: missing required field",
    scope: `e2e-validate-aichat-${crypto.randomUUID()}`,
    schema: z.object({
      message: z.string().min(1).max(2000),
      language: z.enum(["en", "sw"]).optional(),
    }).strict(),
    body: { language: "en" }, // missing 'message'
  },
  {
    name: "chw-location-update: lat out of range",
    scope: `e2e-validate-chw-${crypto.randomUUID()}`,
    schema: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }).strict(),
    body: { latitude: 9999, longitude: 0 },
  },
  {
    name: "emergency-alert: unexpected extra field rejected",
    scope: `e2e-validate-emergency-${crypto.randomUUID()}`,
    schema: z.object({
      symptoms: z.string().min(1).max(2000),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }).strict(),
    body: { symptoms: "headache", latitude: 0, longitude: 0, evil: true },
  },
];

for (const c of CASES) {
  Deno.test({ name: c.name, fn: async () => {
    await flushSecurityEvents();
    const since = new Date(Date.now() - 1000).toISOString();
    const req = new Request("https://test.local/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c.body),
    });
    const parsed = await parseBody(req, c.schema);
    assertEquals(parsed.ok, false);
    assert(parsed.error, "parse error message expected");

    const res = badRequest(parsed.error!, CORS, {
      scope: c.scope,
      ip: "10.88.0.1",
    }, parsed.issues);

    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(typeof body.error, "string");
    assert(body.error.length > 0);

    // Verify the security_events row was logged
    const ev = await waitForEvent(c.scope, since);
    assert(ev, `expected a validation_failed event for scope ${c.scope}`);
    assertEquals(ev.event_type, "validation_failed");
    assertEquals(ev.scope, c.scope);
    assertEquals(ev.severity, "warn");
    assert(ev.details && typeof ev.details === "object", "details must be an object");
    assert("error" in ev.details, "details.error required");
    assert(Array.isArray(ev.details.issues), "details.issues required");

    // Drain log inserts before cleanup
    await flushSecurityEvents();
    // Cleanup
    await svc().from("security_events").delete().eq("scope", c.scope);
  } });
}
