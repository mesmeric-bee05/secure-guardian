// Strict CORS allowlist. Add new origins via ALLOWED_ORIGINS_EXTRA env var
// (comma-separated). Requests from non-allowed origins receive no CORS
// reflection; browsers will block them, and explicit isOriginAllowed() lets
// handlers reject non-OPTIONS calls with 403.

const STATIC_ALLOWED_ORIGINS = [
  'https://id-preview--a195f4d5-59f8-49b0-9a16-0b1c51758426.lovable.app',
  'https://a195f4d5-59f8-49b0-9a16-0b1c51758426.lovableproject.com',
  'https://fortify-trust-wall.lovable.app',
];

function getAllowedOrigins(): string[] {
  const extra = (Deno.env.get('ALLOWED_ORIGINS_EXTRA') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...STATIC_ALLOWED_ORIGINS, ...extra];
}

export function isOriginAllowed(req: Request): boolean {
  const origin = req.headers.get('Origin');
  if (!origin) return true; // non-browser / same-origin
  return getAllowedOrigins().includes(origin);
}

const BASE_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowed = getAllowedOrigins();
  const headers: Record<string, string> = {
    ...BASE_SECURITY_HEADERS,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export function rejectDisallowedOrigin(req: Request): Response | null {
  if (req.method === 'OPTIONS') return null;
  if (isOriginAllowed(req)) return null;
  return new Response(
    JSON.stringify({ error: 'Origin not allowed' }),
    {
      status: 403,
      headers: { ...BASE_SECURITY_HEADERS, 'Content-Type': 'application/json' },
    },
  );
}

export function getClientIP(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown';
}
