

# Fix Priority Badge Duplication, Verify Protocols & CSRF

## 1. Fix Duplicated Priority Badge Text

**File:** `src/components/dashboard/CaseCard.tsx` (lines 53-54)

**Problem:** The Badge renders TWO text nodes:
- Line 53: `{t(case_.priority..., language)}` → outputs e.g. "Critical"
- Line 54: `{case_.priority.charAt(0).toUpperCase() + case_.priority.slice(1)}` → outputs "Critical" again

**Fix:** Remove line 53 entirely. Keep only the capitalized priority string on line 54. The `t()` call was malformed anyway (broken type assertion that always resolved to `'low'`).

## 2. Verify First Aid Protocols (No Code Changes Expected)

After fixing the badge, navigate to the home page to confirm:
- All 24 protocols render (after duplicate cleanup migration)
- No duplicate "Heart Attack" or "Choking" entries
- Language toggle switches titles/content between EN and SW
- "View All" button appears when >6 protocols exist

## 3. Verify Emergency Alert CSRF Flow

Navigate to `/emergency`, trigger alert submission, and confirm:
- CSRF token is generated and validated on submit
- Removing `csrf_token` from sessionStorage triggers the security error toast
- Normal submissions succeed with valid token

## Technical Details

**CaseCard.tsx change** — replace lines 53-54:
```tsx
// Before (two text nodes = duplication):
{t(case_.priority as ..., language)}
{case_.priority.charAt(0).toUpperCase() + case_.priority.slice(1)}

// After (single text node):
{case_.priority.charAt(0).toUpperCase() + case_.priority.slice(1)}
```

Single-line fix, no other files affected.

