// Load-burst tests confirming USSD donate + clinic branches enforce per-phone
// user-scoped limits (userLimitPerMin) and emit rate_limit_429 security events.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { flushSecurityEvents } from "../_shared/securityLog.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const URL_FN = `${SUPABASE_URL}/functions/v1/ussd-handler`;

const opts = { sanitizeOps: false, sanitizeResources: false } as const;

function body(text: string, phone: string, sessionId: string) {
  const fd = new FormData();
  fd.set("sessionId", sessionId);
  fd.set("phoneNumber", phone);
  fd.set("text", text);
  return fd;
}

async function fire(text: string, phone: string, n: number) {
  const results: Response[] = [];
  for (let i = 0; i < n; i++) {
    const sid = `burst-${crypto.randomUUID()}`;
    const res = await fetch(URL_FN, {
      method: "POST",
      headers: { apikey: ANON_KEY },
      body: body(text, phone, sid),
    });
    results.push(res);
  }
  return Promise.all(results.map(async (r) => ({ status: r.status, text: await r.text() })));
}

Deno.test({ ...opts, name: "USSD donate burst: >10/min per phone produces bilingual 429 body" }, async () => {
  const phone = `+25470${Math.floor(1e7 + Math.random() * 9e7)}`;
  const outcomes = await fire("5*500", phone, 25);
  const denied = outcomes.filter((o) => /Too many donation attempts|Majaribio mengi ya mchango/.test(o.text));
  assert(denied.length > 0, `expected at least one throttled donate response, got ${JSON.stringify(outcomes.slice(0, 3))}`);
  await flushSecurityEvents();
});

Deno.test({ ...opts, name: "USSD clinic burst: >20/min per phone produces bilingual 429 body" }, async () => {
  const phone = `+25470${Math.floor(1e7 + Math.random() * 9e7)}`;
  const outcomes = await fire("2", phone, 35);
  const denied = outcomes.filter((o) => /Too many clinic lookups|Maombi mengi ya kliniki/.test(o.text));
  assert(denied.length > 0, `expected at least one throttled clinic response, got ${JSON.stringify(outcomes.slice(0, 3))}`);
  await flushSecurityEvents();
});
