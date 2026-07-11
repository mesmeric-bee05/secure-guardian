// Non-sensitive JWT validation logging. Emits structured console.warn with
// only enum reasons + booleans — never the token, user id, email, or role
// string — so operators can troubleshoot 401s without leaking secrets.
// Also fire-and-forgets a security_events row (event_type='auth_failed')
// so failures surface in the admin Security Analytics tab.
import { logSecurityEvent } from "./securityLog.ts";

export type JwtFailureReason =
  | "missing_bearer"
  | "invalid_token"
  | "missing_sub"
  | "wrong_role";

export interface JwtFailureContext {
  fn: string;
  reason: JwtFailureReason;
  authHeader?: string | null;
  claims?: { sub?: unknown; role?: unknown } | null;
  ip?: string | null;
}

function ipPrefix(ip: string | null | undefined): string {
  if (!ip) return "unknown";
  // Trim to /24 (v4) or /48 (v6) prefix so logs remain non-identifying.
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + "::";
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  return "unknown";
}

/** Structured, PII-safe JWT failure log + audit event. Safe to call from any edge fn. */
export function logJwtFailure(ctx: JwtFailureContext): void {
  const record = {
    tag: "JWT_AUTH_FAILURE",
    fn: ctx.fn,
    reason: ctx.reason,
    has_auth_header: !!ctx.authHeader,
    bearer_prefix: !!ctx.authHeader?.startsWith("Bearer "),
    sub_present: !!ctx.claims?.sub,
    role_present: !!ctx.claims?.role,
    ip_prefix: ipPrefix(ctx.ip ?? null),
  };
  console.warn(JSON.stringify(record));

  // Non-blocking audit record; drained by withSecurityEventFlush when present.
  try {
    logSecurityEvent({
      event_type: "auth_failed",
      scope: ctx.fn,
      ip_address: record.ip_prefix,
      details: {
        reason: ctx.reason,
        has_auth_header: record.has_auth_header,
        sub_present: record.sub_present,
        role_present: record.role_present,
      },
      severity: "info",
    });
  } catch {
    /* best-effort; console line above is the durable signal */
}

/** Classify a post-getClaims failure into a non-sensitive reason enum. */
export function classifyClaims(
  err: unknown,
  claims: { claims?: { sub?: unknown; role?: unknown } } | null | undefined,
): "invalid_token" | "missing_sub" | "wrong_role" {
  if (err || !claims?.claims) return "invalid_token";
  if (!claims.claims.sub) return "missing_sub";
  return "wrong_role";
}
}
