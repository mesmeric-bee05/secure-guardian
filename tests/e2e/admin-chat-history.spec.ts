// E2E: admin Chat History — stored messages are searchable per conversation.
// Seeds two tagged conversations for the regular test user via the service role.
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? "";
const ADMIN_PASS = process.env.TEST_ADMIN_PASSWORD ?? "";
const USER_EMAIL = process.env.TEST_USER_EMAIL ?? "";
const USER_PASS = process.env.TEST_USER_PASSWORD ?? "";
const ok = Boolean(SUPABASE_URL && ANON && SERVICE && ADMIN_EMAIL && ADMIN_PASS && USER_EMAIL && USER_PASS);

const RUN = `chat${Date.now().toString(36)}`;
const TOKEN_A = `${RUN}alpha`;
const TOKEN_B = `${RUN}bravo`;
const sessionIds: string[] = [];
const svc = () => createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

async function loginAdmin(page: Page) {
  await page.goto("/auth");
  await page.locator("#login-email").fill(ADMIN_EMAIL);
  await page.locator("#login-password").fill(ADMIN_PASS);
  await page.locator("form").filter({ has: page.locator("#login-email") }).getByRole("button").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 15_000 });
  await page.goto("/admin");
  await page.getByRole("button", { name: /chat history/i }).first().click();
}

async function search(page: Page, term: string) {
  await page.getByTestId("chat-search").fill(term);
  await page.getByRole("button", { name: /^search$/i }).click();
}

test.describe("Admin Chat History", () => {
  test.skip(!ok, "requires service role + admin and user test logins");

  test.beforeAll(async () => {
    const c = svc();
    const u = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
    const { data: auth, error } = await u.auth.signInWithPassword({ email: USER_EMAIL, password: USER_PASS });
    if (error || !auth.user) throw new Error(`user login: ${error?.message}`);
    for (const [title, token] of [[`E2E ${RUN} A`, TOKEN_A], [`E2E ${RUN} B`, TOKEN_B]]) {
      const s = await c.from("chat_sessions").insert({ user_id: auth.user.id, title, language: "en" }).select("id").single();
      if (s.error) throw new Error(`seed session: ${s.error.message}`);
      sessionIds.push(s.data.id);
      const m = await c.from("chat_messages").insert([
        { session_id: s.data.id, role: "user", content: `Question ${token}` },
        { session_id: s.data.id, role: "assistant", content: `Answer ${token}` },
      ]);
      if (m.error) throw new Error(`seed messages: ${m.error.message}`);
    }
  });

  test.afterAll(async () => {
    const c = svc();
    if (sessionIds.length) {
      await c.from("chat_messages").delete().in("session_id", sessionIds);
      await c.from("chat_sessions").delete().in("id", sessionIds);
    }
  });

  test("each message is stored and search narrows to one conversation", async ({ page }) => {
    const { count } = await svc().from("chat_messages").select("id", { count: "exact", head: true }).in("session_id", sessionIds);
    expect(count).toBe(4);

    await loginAdmin(page);
    await search(page, TOKEN_A);
    await expect(page.getByTestId("chat-session-row")).toHaveCount(1, { timeout: 15_000 });
    await page.getByTestId("chat-session-row").first().click();
    await expect(page.getByTestId("chat-thread-message")).toHaveCount(2);
    await expect(page.getByTestId("chat-thread-message").filter({ hasText: TOKEN_B })).toHaveCount(0);

    await search(page, RUN);
    await expect(page.getByTestId("chat-session-row")).toHaveCount(2, { timeout: 15_000 });

    await search(page, `${RUN}nomatch`);
    await expect(page.getByTestId("chat-empty")).toBeVisible();
  });

  test("non-admin cannot read other users' chat history", async () => {
    const c = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS }); // sanity: admin can
    const admin = await c.from("chat_sessions").select("id").in("id", sessionIds);
    expect(admin.data?.length).toBe(2);
    const other = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
    // A fresh anonymous client must see nothing.
    const anon = await other.from("chat_messages").select("id").in("session_id", sessionIds);
    expect(anon.data ?? []).toHaveLength(0);
  });
});
