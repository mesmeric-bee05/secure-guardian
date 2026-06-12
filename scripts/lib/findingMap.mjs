// Shared mapping of scanner finding internal_id -> remediation location.
// Used by render-report, security-annotate, security-open-issues, and security-verify-links.
//
// Entry shape:
//   {
//     file: "path/to/file" | "pseudo:<label>",  // pseudo: paths are skipped by link verifier
//     line: number | null,                       // optional 1-based line for CI annotations
//     affected: "comma,separated,public.symbols",
//     fix: "human-readable recommended fix",
//     owner: "platform-security"                 // optional default owner override
//   }

export const FIX_MAP = {
  SUPA_authenticated_security_definer_function_executable: {
    file: "supabase/migrations/20260510103858_bbd68668-925c-4856-a196-32e3556550c7.sql",
    line: null,
    affected:
      "public.has_role, public.is_admin, public.is_chw, public.log_admin_action, public.admin_run_security_events_purge, public.security_events_summary, public.security_events_retention_status, public.security_top_ips",
    fix: "Accepted: RLS helpers need authenticated EXECUTE; admin RPCs gate via is_admin(auth.uid()).",
    owner: "platform-security",
  },
  SUPA_extension_in_public: {
    file: "pseudo:supabase-extension",
    line: null,
    affected: "extension public.pg_net",
    fix: "Accepted: required in public for managed pg_cron jobs.",
    owner: "platform-security",
  },
};

export const SEV = ["info", "warn", "high", "critical"];

export function normaliseLevel(level) {
  const l = String(level || "warn").toLowerCase();
  if (l === "error") return "high";
  if (l === "low") return "info";
  if (l === "medium" || l === "moderate") return "warn";
  if (SEV.includes(l)) return l;
  return "warn";
}

export function isAllowlisted(allowlist, finding) {
  return (allowlist.entries || []).some(
    (e) =>
      e.scanner_name === finding.scanner_name &&
      e.internal_id === finding.internal_id &&
      (!e.expires_at || new Date(e.expires_at).getTime() >= Date.now()),
  );
}

export function flattenSnapshot(snapshot) {
  const rows = [];
  for (const [scanner, payload] of Object.entries(snapshot?.scanners || {})) {
    for (const raw of payload.findings || []) {
      rows.push({
        scanner_name: scanner,
        internal_id: raw.internal_id || raw.id,
        name: raw.name || raw.id,
        severity: normaliseLevel(raw.level || raw.severity),
        created_at: raw.created_at || payload.timestamp,
        link: raw.link || "",
      });
    }
  }
  return rows;
}

export function mapFor(internal_id) {
  return (
    FIX_MAP[internal_id] || {
      file: "pseudo:unmapped",
      line: null,
      affected: "(unknown)",
      fix: "Review scanner guidance.",
      owner: "platform-security",
    }
  );
}
