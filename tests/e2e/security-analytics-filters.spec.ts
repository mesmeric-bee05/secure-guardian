// E2E: SecurityAnalyticsTab filter aggregation + CSV export.
// Requires TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD (or a preinjected
// LOVABLE_BROWSER_SUPABASE_SESSION_JSON) and SUPABASE_SERVICE_ROLE_KEY
// to seed rows. Skips gracefully when creds are absent so forks/CI without
// secrets stay green.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";


const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? "";
const ADMIN_PASS = process.env.TEST_ADMIN_PASSWORD ?? "";
const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY ?? "";
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON ?? "";

const hasSeedCreds = SUPABASE_URL && SERVICE && ANON;
const hasAdmin = (ADMIN_EMAIL && ADMIN_PASS) || (STORAGE_KEY && SESSION_JSON);

const TAG = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const NOW = new Date();
const FROM = new Date(NOW.getTime() - 60 * 60 * 1000);

test.describe("Security Analytics — filters + CSV", () => {
  test.skip(!hasSeedCreds || !hasAdmin, "requires SUPABASE_SERVICE_ROLE_KEY + admin credentials");

  test.beforeAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => ({
        event_type: "rate_limit_429",
        scope: "ussd-donate",
        ip_address: "10.0.0.1",
        severity: "info",
        details: { menu_path: "5*100", phone_hash: `${TAG}-donate-${i}`.padEnd(64, "0") },
        created_at: new Date(FROM.getTime() + i * 60_000).toISOString(),
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        event_type: "validation_failed",
        scope: "ussd-schema",
        ip_address: "10.0.0.2",
        severity: "info",
        details: { menu_path: "", phone_hash: `${TAG}-val-${i}`.padEnd(64, "0") },
        created_at: new Date(FROM.getTime() + (i + 3) * 60_000).toISOString(),
      })),
      {
        event_type: "auth_failed",
        scope: "ai-chat",
        ip_address: "10.0.0.3",
        severity: "info",
        details: { reason: "missing_sub", tag: TAG },
        created_at: new Date(FROM.getTime() + 5 * 60_000).toISOString(),
      },
    ];
    const { error } = await admin.from("security_events").insert(rows);
    if (error) throw new Error(`seed failed: ${error.message}`);
  });

  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    await admin
      .from("security_events")
      .delete()
      .or(`details->>tag.eq.${TAG},details->>phone_hash.ilike.${TAG}%`);
  });

  async function login(page: import("@playwright/test").Page) {
    if (STORAGE_KEY && SESSION_JSON) {
      await page.goto("/");
      await page.evaluate(
        ({ k, v }) => window.localStorage.setItem(k, v),
        { k: STORAGE_KEY, v: SESSION_JSON },
      );
    } else {
      await page.goto("/auth");
      await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
      await page.getByLabel(/password/i).fill(ADMIN_PASS);
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForURL(/\/(index|dashboard|admin|)$/i, { timeout: 15_000 });
    }
    await page.goto("/admin");
    // Open the Security Analytics tab (label may be "Sec Analytics" on mobile tabs).
    const tab = page.getByRole("button", { name: /security\s*analytics/i }).first();
    await tab.click();
    await expect(page.getByRole("heading", { name: /security analytics/i })).toBeVisible();
  }

  function fromDateStr() { return FROM.toISOString().slice(0, 10); }
  function toDateStr() { return NOW.toISOString().slice(0, 10); }

  // The user id of the admin identity `login()` uses — needed to assert the
  // audit row was attributed to the right actor.
  async function adminUserId(): Promise<string> {
    if (STORAGE_KEY && SESSION_JSON) {
      const s = JSON.parse(SESSION_JSON) as { user?: { id?: string } };
      if (s.user?.id) return s.user.id;
    }
    const c = createClient(SUPABASE_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await c.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS });
    if (error || !data.user) throw new Error(`admin sign-in failed: ${error?.message}`);
    return data.user.id;
  }

  // Numeric row count rendered in the header badge ("N rows...").
  async function uiRowCount(page: import("@playwright/test").Page): Promise<number> {
    const txt = (await page.getByTestId("sec-row-count").innerText()).trim();
    const m = txt.match(/^(\d+)\s+rows/);
    if (!m) throw new Error(`could not parse row count from "${txt}"`);
    return Number(m[1]);
  }

  // Read a download's bytes AND persist it under the Playwright output dir so
  // CI can upload the exact exported file as a debugging artifact. A small
  // JSON sidecar records the filters/filename for fast triage.
  async function readDownload(
    download: import("@playwright/test").Download,
    testInfo: import("@playwright/test").TestInfo,
    label: string,
    meta: Record<string, unknown> = {},
  ): Promise<string> {
    const target = testInfo.outputPath(`downloads/${label}.csv`);
    mkdirSync(dirname(target), { recursive: true });
    await download.saveAs(target);
    const csv = readFileSync(target, "utf8");
    writeFileSync(
      testInfo.outputPath(`downloads/${label}.meta.json`),
      JSON.stringify(
        {
          label,
          suggestedFilename: download.suggestedFilename(),
          bytes: Buffer.byteLength(csv, "utf8"),
          lines: csv.replace(/\r\n/g, "\n").trim().split("\n").length,
          from: fromDateStr(),
          to: toDateStr(),
          ...meta,
        },
        null,
        2,
      ),
      "utf8",
    );
    return csv;
  }

  const HEADER = "bucket,event_type,count";

  // The in-app export is a client-side Blob download, so the only observable
  // "content-disposition" is the suggested filename; the MIME contract is
  // proven separately against the streaming export endpoint.
  function assertDownloadName(
    download: import("@playwright/test").Download,
    bucket: "day" | "hour",
  ) {
    const name = download.suggestedFilename();
    expect(name, `filename: ${name}`).toMatch(
      /^security-analytics-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}-(day|hour)-[A-Za-z0-9_]+(-[A-Za-z0-9]+)?\.csv$/,
    );
    expect(name).toContain(`-${bucket}-`);
    expect(name).toContain(`${fromDateStr()}_${toDateStr()}`);
    expect(name.endsWith(".csv")).toBe(true);
  }

  // Validate CSV header columns, per-row field formats, deterministic ordering
  // and numeric aggregation for a given bucket.
  // `expectedEvents` is the number of raw events shown in the UI badge; the CSV
  // aggregates them into (bucket, event_type) rows, so the *sum of counts*
  // must equal it.
  function assertCsvShape(csv: string, bucket: "day" | "hour", expectedEvents?: number) {
    expect(csv.charCodeAt(0)).not.toBe(0xfeff); // no BOM
    expect(csv).not.toMatch(/\n\s*\n/); // no blank lines
    const lines = csv.replace(/\r\n/g, "\n").trim().split("\n");
    expect(lines[0]).toBe(HEADER);
    const body = lines.slice(1);

    // Bucket labels are produced from toISOString(), so they are UTC by
    // construction: `YYYY-MM-DD` for day and `YYYY-MM-DDTHH:00` for hour.
    const bucketRe = bucket === "day"
      ? /^\d{4}-\d{2}-\d{2}$/
      : /^\d{4}-\d{2}-\d{2}T\d{2}:00$/;
    const fromMs = new Date(`${fromDateStr()}T00:00:00.000Z`).getTime();
    const toMs = new Date(`${toDateStr()}T23:59:59.999Z`).getTime();
    const bucketFormats = new Set<string>();

    let sum = 0;
    const seen = new Set<string>();
    const orderKeys: string[] = [];

    for (const line of body) {
      const fields = line.split(",");
      expect(fields, `row must have exactly 3 fields: "${line}"`).toHaveLength(3);
      const [bucketVal, evt, cnt] = fields;
      expect(bucketVal, `bucket field format for ${bucket}: "${bucketVal}"`).toMatch(bucketRe);
      // Every bucket in one export must share the exact same shape (no mixed
      // local/UTC or mixed separators).
      bucketFormats.add(
        bucketVal.replace(/\d/g, "N"),
      );
      // Parsing as explicit UTC must round-trip to the same label — this fails
      // if the value were ever rendered in a local timezone.
      const utcIso = bucket === "day"
        ? `${bucketVal}T00:00:00.000Z`
        : `${bucketVal}:00.000Z`;
      const parsed = new Date(utcIso);
      expect(Number.isNaN(parsed.getTime()), `unparseable UTC bucket "${bucketVal}"`).toBe(false);
      const roundTrip = bucket === "day"
        ? parsed.toISOString().slice(0, 10)
        : `${parsed.toISOString().slice(0, 13)}:00`;
      expect(roundTrip, `bucket "${bucketVal}" is not a UTC-normalised label`).toBe(bucketVal);
      // Bucket boundaries must be aligned to the granularity, in UTC.
      expect(parsed.getUTCSeconds()).toBe(0);
      expect(parsed.getUTCMilliseconds()).toBe(0);
      expect(parsed.getUTCMinutes()).toBe(0);
      if (bucket === "day") expect(parsed.getUTCHours()).toBe(0);
      // …and inside the selected day/hour window (inclusive), in UTC.
      expect(parsed.getTime(), `bucket "${bucketVal}" before selected window`).toBeGreaterThanOrEqual(fromMs);
      expect(parsed.getTime(), `bucket "${bucketVal}" after selected window`).toBeLessThanOrEqual(toMs);

      expect(evt).toMatch(/^[a-z0-9_]+$/);
      expect(cnt).toMatch(/^\d+$/);
      expect(Number.isInteger(Number(cnt))).toBe(true);
      expect(Number(cnt)).toBeGreaterThanOrEqual(1);

      // No duplicate (bucket, event_type) pairs.
      const key = `${bucketVal}|${evt}`;
      expect(seen.has(key), `duplicate row for ${key}`).toBe(false);
      seen.add(key);
      orderKeys.push(key);
      sum += Number(cnt);
    }

    // Every bucket label in the file uses one consistent UTC format.
    expect(
      [...bucketFormats],
      "all bucket timestamps must share one UTC format",
    ).toHaveLength(Math.min(bucketFormats.size, 1));

    // Deterministic ordering: bucket ascending, then event_type alphabetically.
    const sorted = [...orderKeys].sort((a, b) => a.localeCompare(b));
    expect(orderKeys, "rows must be sorted by bucket then event_type").toEqual(sorted);


    if (typeof expectedEvents === "number") expect(sum).toBe(expectedEvents);
    return { rows: body.length, sum };
  }





  test("filters by event_type + menu_path aggregate to the right count", async ({ page }) => {
    await login(page);
    await page.getByTestId("sec-filter-from").fill(fromDateStr());
    await page.getByTestId("sec-filter-to").fill(toDateStr());
    // event_type = rate_limit_429
    await page.getByTestId("sec-filter-event-type").click();
    await page.getByRole("option", { name: "rate_limit_429" }).click();
    await page.getByTestId("sec-filter-menu-path").fill("donate");
    await page.getByTestId("sec-refresh").click();
    await expect(page.getByTestId("sec-row-count")).toContainText(/^3 rows/);

    // Clear filters — all 6 seed rows back.
    await page.getByTestId("sec-filter-event-type").click();
    await page.getByRole("option", { name: /all event types/i }).click();
    await page.getByTestId("sec-filter-menu-path").fill("");
    await page.getByTestId("sec-refresh").click();
    await expect(page.getByTestId("sec-row-count")).toContainText(/(6|[7-9]|\d{2,}) rows/);
  });

  test("CSV export contents reflect active filters", async ({ page }, testInfo) => {
    await login(page);
    await page.getByTestId("sec-filter-from").fill(fromDateStr());
    await page.getByTestId("sec-filter-to").fill(toDateStr());
    await page.getByTestId("sec-filter-event-type").click();
    await page.getByRole("option", { name: "rate_limit_429" }).click();
    await page.getByTestId("sec-filter-menu-path").fill("donate");
    await page.getByTestId("sec-refresh").click();
    await expect(page.getByTestId("sec-row-count")).toContainText(/^3 rows/);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("sec-export-csv").click(),
    ]);
    const csv = (await readDownload(download, testInfo, "filtered-export")).trim();
    const [header, ...body] = csv.split("\n");
    expect(header).toBe(HEADER);
    expect(body.length).toBeGreaterThan(0);
    let total = 0;
    for (const line of body) {
      const [, evt, cnt] = line.split(",");
      expect(evt).toBe("rate_limit_429");
      total += Number(cnt);
    }
    expect(total).toBe(3);
    expect(csv).not.toContain("validation_failed");
    expect(csv).not.toContain("auth_failed");
  });

  test("no-match filter shows zero rows and exports a header-only CSV", async ({ page }, testInfo) => {
    await login(page);
    await page.getByTestId("sec-filter-from").fill(fromDateStr());
    await page.getByTestId("sec-filter-to").fill(toDateStr());
    await page.getByTestId("sec-filter-menu-path").fill(`no-such-path-${TAG}`);
    await page.getByTestId("sec-refresh").click();
    await expect(page.getByTestId("sec-row-count")).toContainText(/^0 rows/);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("sec-export-csv").click(),
    ]);
    const csv = (await readDownload(download, testInfo, "no-match-export")).trim();
    expect(csv).toBe(HEADER);
  });


  for (const bucket of ["day", "hour"] as const) {
    test(`admin CSV export (${bucket} bucket) matches the CSV format and writes an audit_logs entry`, async ({ page }, testInfo) => {
      const admin = createClient(SUPABASE_URL, SERVICE, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const expectedUserId = await adminUserId();
      const since = new Date().toISOString();

      await login(page);
      await page.getByTestId("sec-filter-from").fill(fromDateStr());
      await page.getByTestId("sec-filter-to").fill(toDateStr());
      // Bucket select is the only one without a testid; pick it by current value.
      await page.getByRole("combobox").filter({ hasText: /^(Hour|Day)$/ }).click();
      await page.getByRole("option", { name: bucket === "day" ? "Day" : "Hour" }).click();
      await page.getByTestId("sec-refresh").click();
      await expect(page.getByTestId("sec-row-count")).not.toContainText(/^0 rows/);
      const expectedRows = await uiRowCount(page);

      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("sec-export-csv").click(),
      ]);
      const csv = await readDownload(download, testInfo, `export-${bucket}`, {
        bucket,
        uiRowCount: expectedRows,
      });
      assertDownloadName(download, bucket);
      assertCsvShape(csv, bucket, expectedRows);

      // Determinism: exporting the same filters again yields identical bytes.
      const [download2] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("sec-export-csv").click(),
      ]);
      const csv2 = await readDownload(download2, testInfo, `export-${bucket}-repeat`, { bucket });
      expect(csv2).toBe(csv);
      expect(download2.suggestedFilename()).toBe(download.suggestedFilename());




      // Poll for the audit row (RPC write is fire-and-forget).
      type AuditRow = {
        action: string;
        user_id: string | null;
        resource_type: string | null;
        details: Record<string, unknown>;
      };
      let row: AuditRow | undefined;
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline && !row) {
        const { data } = await admin
          .from("audit_logs")
          .select("action, user_id, resource_type, details, created_at")
          .eq("action", "security_analytics_export")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1);
        row = (data ?? [])[0] as AuditRow | undefined;
        if (!row) await new Promise((r) => setTimeout(r, 500));
      }
      expect(row, "expected a security_analytics_export audit entry").toBeTruthy();
      expect(row!.action).toBe("security_analytics_export");
      expect(row!.resource_type).toBe("security_events");
      expect(row!.user_id).toBe(expectedUserId);
      expect(row!.details).toMatchObject({
        from: fromDateStr(),
        to: toDateStr(),
        granularity: bucket,
        rows: expectedRows,
      });

      // And the UI reflects the trail, including the same row count.
      await expect(page.getByTestId("sec-last-audit")).toContainText(/Last export: security_analytics_export/);
      await expect(page.getByTestId("sec-last-audit")).toContainText(`${expectedRows} rows`);
    });
  }

  // The streaming server export is the only path with real HTTP response
  // headers — prove the MIME type and attachment filename contract there,
  // for both a day-wide and an hour-wide window.
  for (const [bucket, hours] of [["day", 24], ["hour", 1]] as const) {
    test(`streaming export returns CSV content-type and attachment filename (${bucket} window)`, async ({ request }) => {
      if (!ADMIN_EMAIL || !ADMIN_PASS) test.skip(true, "requires TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD");
      const c = createClient(SUPABASE_URL, ANON, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await c.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS });
      expect(error).toBeNull();
      const token = data.session!.access_token;

      const res = await request.post(`${SUPABASE_URL}/functions/v1/security-events-export`, {
        headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: { since: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString() },
      });
      expect(res.status()).toBe(200);
      const headers = res.headers();
      expect(headers["content-type"]).toContain("text/csv");
      expect(headers["content-type"]).toContain("charset=utf-8");
      expect(headers["content-disposition"]).toMatch(
        /^attachment; filename="security-events-[0-9TZ\-]+\.csv"$/,
      );
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["cache-control"]).toContain("no-store");

      const body = await res.text();
      expect(body.split("\n")[0]).toBe("created_at,event_type,scope,severity,ip_address,user_id,details");
    });
  }
});



