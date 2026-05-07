import { z } from "https://esm.sh/zod@3.23.8";
import { logSecurityEvent } from "./securityLog.ts";

// Reusable primitives -------------------------------------------------------
export const UuidSchema = z.string().uuid();
export const LanguageSchema = z.enum(['en', 'sw']);
export const PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number format');
export const LatSchema = z.number().finite().min(-90).max(90);
export const LngSchema = z.number().finite().min(-180).max(180);
export const BoundedText = (min: number, max: number) =>
  z.string().trim().min(min).max(max);

export interface ParseResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  issues?: Array<{ path: string; message: string }>;
}

/** Parse JSON body against a strict Zod schema. Returns 400-ready error string on failure. */
export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<ParseResult<z.infer<T>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, error: 'Invalid JSON body' };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join('.') || 'body',
      message: i.message,
    }));
    const issue = result.error.issues[0];
    const path = issue?.path?.join('.') || 'body';
    return {
      ok: false,
      error: `${path}: ${issue?.message || 'invalid'}`,
      issues,
    };
  }
  return { ok: true, data: result.data };
}

export interface ValidationLogContext {
  scope: string;
  ip?: string | null;
  userId?: string | null;
}

export function badRequest(
  error: string,
  corsHeaders: Record<string, string>,
  ctx?: ValidationLogContext,
  issues?: Array<{ path: string; message: string }>,
): Response {
  if (ctx) {
    logSecurityEvent({
      event_type: "validation_failed",
      scope: ctx.scope,
      ip_address: ctx.ip ?? null,
      user_id: ctx.userId ?? null,
      details: { error, issues: issues ?? [] },
      severity: "warn",
    });
  }
  return new Response(JSON.stringify({ error }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
