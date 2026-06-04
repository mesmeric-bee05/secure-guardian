// E2E: onboarding → case status → CHW push notification.
//
// Verifies the role-gate on send-push-notification: when target_role='chw' is
// set, only recipients holding the CHW role can be delivered to. A non-CHW
// user with the same notification user_id is filtered out by the function.
//
// These tests require SUPABASE_SERVICE_ROLE_KEY because send-push-notification
// is restricted to service-role callers. They auto-skip when absent.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUSH_URL = `${SUPABASE_URL}/functions/v1/send-push-notification`;

const opts = { sanitizeOps: false, sanitizeResources: false } as const;
const skip = !SERVICE_ROLE;

interface Fixture { chwUserId: string; userUserId: string; cleanup: () => Promise<void>; }

async function seedFixture(): Promise<Fixture> {
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const chwEmail = `chw-push-e2e-${crypto.randomUUID()}@test.local`;
  const userEmail = `user-push-e2e-${crypto.randomUUID()}@test.local`;

  const mk = async (email: string) => {
    const { data, error } = await svc.auth.admin.createUser({
      email, password: crypto.randomUUID() + "Aa!1", email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
    return data.user.id;
  };

  const chwId = await mk(chwEmail);
  const userId = await mk(userEmail);

  // Profiles + roles
  await svc.from("profiles").upsert([
    { user_id: chwId, full_name: "CHW Push Test", preferred_language: "en", region: "Dar es Salaam" },
    { user_id: userId, full_name: "User Push Test", preferred_language: "en", region: "Dar es Salaam" },
  ], { onConflict: "user_id" });
  await svc.from("user_roles").upsert([
    { user_id: chwId, role: "chw" },
    { user_id: userId, role: "user" },
  ], { onConflict: "user_id,role" });

  // Fake push subscriptions for both
  const ep = (tag: string) => `https://push.example/test-${tag}-${crypto.randomUUID()}`;
  await svc.from("push_subscriptions").upsert([
    { user_id: chwId, endpoint: ep("chw"), p256dh: "x", auth: "y" },
    { user_id: userId, endpoint: ep("user"), p256dh: "x", auth: "y" },
  ], { onConflict: "endpoint" });

  return {
    chwUserId: chwId,
    userUserId: userId,
    cleanup: async () => {
      await svc.from("push_subscriptions").delete().in("user_id", [chwId, userId]);
      await svc.from("user_roles").delete().in("user_id", [chwId, userId]);
      await svc.from("profiles").delete().in("user_id", [chwId, userId]);
      await svc.auth.admin.deleteUser(chwId).catch(() => {});
      await svc.auth.admin.deleteUser(userId).catch(() => {});
    },
  };
}

async function callPush(body: Record<string, unknown>): Promise<Response> {
  return await fetch(PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify(body),
  });
}

Deno.test({
  ...opts,
  name: "push role gate: target_role='chw' delivers to CHW (dry-run)",
  ignore: skip,
}, async () => {
  const fx = await seedFixture();
  try {
    const res = await callPush({
      user_id: fx.chwUserId,
      title: "Case assigned",
      body: "A new case needs attention",
      target_role: "chw",
      dry_run: true,
    });
    const json = await res.json();
    assertEquals(res.status, 200);
    assertEquals(json.success, true);
    assertEquals(json.dry_run, true);
    assert(Array.isArray(json.recipients) && json.recipients.length >= 1);
    for (const r of json.recipients) {
      assertEquals(r.user_id, fx.chwUserId);
    }
  } finally {
    await fx.cleanup();
  }
});

Deno.test({
  ...opts,
  name: "push role gate: target_role='chw' is dropped for a non-CHW recipient",
  ignore: skip,
}, async () => {
  const fx = await seedFixture();
  try {
    const res = await callPush({
      user_id: fx.userUserId,
      title: "Case assigned",
      body: "Should not be delivered",
      target_role: "chw",
      dry_run: true,
    });
    const json = await res.json();
    assertEquals(res.status, 200);
    assertEquals(json.sent, 0);
    assertEquals(json.skipped, "role_mismatch");
    assertEquals(json.target_role, "chw");
  } finally {
    await fx.cleanup();
  }
});

Deno.test({
  ...opts,
  name: "onboarding guard: cannot mark complete without emergency contact",
  ignore: skip,
}, async () => {
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const email = `onb-e2e-${crypto.randomUUID()}@test.local`;
  const { data, error } = await svc.auth.admin.createUser({
    email, password: crypto.randomUUID() + "Aa!1", email_confirm: true,
  });
  assert(!error && data.user, `createUser failed: ${error?.message}`);
  const uid = data.user!.id;
  try {
    await svc.from("profiles").upsert(
      { user_id: uid, full_name: "Onb Tester", preferred_language: "en", region: "Dar es Salaam" },
      { onConflict: "user_id" },
    );

    // Without an emergency contact the guard must block completion
    const blocked = await svc.from("profiles").update({ onboarding_completed: true }).eq("user_id", uid);
    assert(blocked.error, "expected onboarding guard to reject completion without emergency contact");
    assert(/onboarding_incomplete/.test(blocked.error!.message));

    // Add a contact, then completion should succeed and stamp onboarding_completed_at
    await svc.from("emergency_contacts").insert({
      user_id: uid, name: "Next of Kin", phone_number: "+255700000000", relationship: "family",
    });
    const ok = await svc.from("profiles").update({ onboarding_completed: true }).eq("user_id", uid).select().single();
    assert(!ok.error, `expected completion to succeed: ${ok.error?.message}`);
    assertEquals(ok.data!.onboarding_completed, true);
    assert(ok.data!.onboarding_completed_at);
  } finally {
    await svc.from("emergency_contacts").delete().eq("user_id", uid);
    await svc.from("profiles").delete().eq("user_id", uid);
    await svc.auth.admin.deleteUser(uid).catch(() => {});
  }
});
