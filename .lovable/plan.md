

# Plan: Restore Auth Trigger, Clean Duplicate Protocols, Add Rate Limiting to Remaining Edge Functions

## Current State (Verified)

**RLS policies**: All PERMISSIVE now -- confirmed via direct query. The Dashboard redirect fix (`rolesLoaded` guard) is in place and correct.

**Auth trigger**: MISSING. `handle_new_user` trigger on `auth.users` does not exist. New signups will fail to get profiles or roles, breaking the entire app for new users.

**Protocols**: 26 protocols exist. There are near-duplicates that should be cleaned:
- "Heart Attack" (`cardiac`) + "Heart Attack Signs" (`heart_attack`) -- keep the one with severity (`heart_attack`, critical)
- "Choking" (`breathing`, no severity) + "Choking Emergency" (`choking`, critical) -- keep the one with severity (`choking`, critical)

**Rate limiting**: Already present on `ai-chat`, `emergency-alert`, `sms-gateway`, `chw-location-update`. Missing on: `send-push-notification`, `sms-retry`, `ussd-handler`, `sms-webhook`.

**CSRF**: Already integrated in `Auth.tsx`, `ProfileForm.tsx`, `EmergencyAlertModal.tsx`. Not yet in `ChatInput.tsx`.

---

## Phase 1: Database Migration

**Restore auth trigger** (critical for new user signups):
```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

**Delete duplicate protocols**:
- Delete "Heart Attack" (id: `7c522129...`, category `cardiac`, no severity)
- Delete "Choking" (id: `b7beec4d...`, category `breathing`, no severity)

## Phase 2: Edge Function Rate Limiting

Add in-memory rate limiters to the 4 functions that lack them:

| Function | Limit | Window | Key |
|---|---|---|---|
| `send-push-notification` | Already service-role only -- add IP-based limiter (20/min) |
| `sms-retry` | Already admin-only -- add user-based limiter (5/min) |
| `ussd-handler` | Phone-number based (30/min) |
| `sms-webhook` | IP-based (100/min) |

Each gets the same pattern already used in `ai-chat`:
```typescript
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string, limit: number, windowMs: number): boolean { ... }
```

## Phase 3: CSRF in ChatInput

Add CSRF validation to `ChatInput.tsx` -- validate token before calling `onSend`. Import `getCsrfToken`/`validateCsrfToken` from `@/lib/csrf`.

## Phase 4: Minor Hardening

- Add `Access-Control-Allow-Methods: POST, OPTIONS` to all edge function CORS headers
- Add `X-Content-Type-Options: nosniff` to edge function responses

## Execution Order

1. Database migration (trigger + protocol cleanup)
2. Edge functions updates (4 files, parallel)
3. ChatInput CSRF integration

