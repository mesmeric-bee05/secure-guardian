// E2E: strict-schema and missing-field failures on the USSD handler persist
// validation_failed security_events rows with the expected event_type,
// scope, menu_path, and hashed phone.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { flushSecurityEvents, sha256Hex } from "../_shared/securityLog.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const URL_FN = `${SUPABASE_URL}/functions/v1/ussd-handler`;

const opts = { sanitizeOps: false, sanitizeResources: false } as const;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

async function post(body: FormData) {
  const res = await fetch(URL_FN, { method: "POST", headers: { apikey: ANON_KEY }, body });
  return { status: res.status, text: await res.text() };
}

async function waitForRow(query: () => Promise<number>, timeoutMs = 6000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let last = 0;
  while (Date.now() < deadline) {
    last = await query();
    if (last > 0) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  return last;
}

async function countEvents(params: {
  since: string;
  scope: string;
  event_type: string;
  phone_hash?: string;
  menu_path?: string;
}) {
  let q = admin
    .from("security_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", params.event_type)
    .eq("scope", params.scope)
    .gte("created_at", params.since);
  if (params.phone_hash) q = q.filter("details->>phone_hash", "eq", params.phone_hash);
  if (params.menu_path !== undefined) q = q.filter("details->>menu_path", "eq", params.menu_path);
  const { count } = await q;
  return count ?? 0;
}

Deno.test({ ...opts, name: "USSD schema: missing phoneNumber logs validation_failed with phone_hash=unknown" }, async () => {
  const since = new Date(Date.now() - 5_000).toISOString();
  const res = await post(fd({ sessionId: `val-${crypto.randomUUID()}`, text: "" }));
  assert(/Invalid request/.test(res.text), `expected invalid response, got ${res.text}`);

  const count = await waitForRow(() =>
    countEvents({ since, scope: "ussd-schema", event_type: "validation_failed", phone_hash: "unknown" }),
  );
  assert(count > 0, "expected validation_failed row for missing phoneNumber");
  await flushSecurityEvents();
});

Deno.test({ ...opts, name: "USSD schema: missing sessionId logs validation_failed with phone_hash" }, async () => {
  const phone = `+25473${Math.floor(1e7 + Math.random() * 9e7)}`;
  const phoneHash = await sha256Hex(phone);
  const since = new Date(Date.now() - 5_000).toISOString();

  const res = await post(fd({ phoneNumber: phone, text: "" }));
  assert(/Invalid request/.test(res.text));

  const count = await waitForRow(() =>
    countEvents({ since, scope: "ussd-schema", event_type: "validation_failed", phone_hash: phoneHash }),
  );
  assert(count > 0, `expected validation_failed row for missing sessionId (phone_hash=${phoneHash.slice(0, 8)}…)`);
  await flushSecurityEvents();
});

Deno.test({ ...opts, name: "USSD schema: unexpected field rejected and logged" }, async () => {
  const phone = `+25474${Math.floor(1e7 + Math.random() * 9e7)}`;
  const phoneHash = await sha256Hex(phone);
  const since = new Date(Date.now() - 5_000).toISOString();

  const res = await post(fd({
    sessionId: `val-${crypto.randomUUID()}`,
    phoneNumber: phone,
    text: "1",
    evil: "1",
  }));
  assert(/Invalid request/.test(res.text));

  const count = await waitForRow(() =>
    countEvents({ since, scope: "ussd-schema", event_type: "validation_failed", phone_hash: phoneHash, menu_path: "1" }),
  );
  assert(count > 0, `expected validation_failed row for unexpected field (phone_hash=${phoneHash.slice(0, 8)}…)`);
  await flushSecurityEvents();
});

Deno.test({ ...opts, name: "USSD schema: invalid text characters rejected" }, async () => {
  const phone = `+25475${Math.floor(1e7 + Math.random() * 9e7)}`;
  const phoneHash = await sha256Hex(phone);
  const since = new Date(Date.now() - 5_000).toISOString();

  const res = await post(fd({
    sessionId: `val-${crypto.randomUUID()}`,
    phoneNumber: phone,
    text: "abc",
  }));
  assert(/Invalid request/.test(res.text));

  const count = await waitForRow(() =>
    countEvents({ since, scope: "ussd-schema", event_type: "validation_failed", phone_hash: phoneHash }),
  );
  assert(count > 0, "expected validation_failed row for invalid text characters");
  await flushSecurityEvents();
});

Deno.test({ ...opts, name: "USSD donate: invalid amount still logs per-branch validation_failed" }, async () => {
  const phone = `+25476${Math.floor(1e7 + Math.random() * 9e7)}`;
  const phoneHash = await sha256Hex(phone);
  const since = new Date(Date.now() - 5_000).toISOString();

  const res = await post(fd({
    sessionId: `val-${crypto.randomUUID()}`,
    phoneNumber: phone,
    text: "5*99999",
  }));
  assert(/Invalid amount|Kiasi si sahihi/.test(res.text));

  const count = await waitForRow(() =>
    countEvents({ since, scope: "ussd-donate", event_type: "validation_failed", phone_hash: phoneHash }),
  );
  assert(count > 0, "expected validation_failed row for donate branch");
  await flushSecurityEvents();
});
