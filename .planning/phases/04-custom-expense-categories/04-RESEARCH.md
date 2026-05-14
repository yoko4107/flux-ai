# Phase 4: Custom Expense Categories - Research

**Researched:** 2026-05-14
**Domain:** AdminConfig JSON extension, Category enum usage, submission validation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from additional_context)

### Locked Decisions
- Use free-text/JSON approach — NOT a full DB migration
- A new AdminConfig key `customCategories` stores a JSON array of `{ name: string, code: string, maxAmount?: number, enabled: boolean }`
- The existing 12 hardcoded Category enum values remain as defaults (no schema change)
- Custom categories are added ON TOP of defaults per CC
- Reimbursement submission shows default categories + CC's custom categories merged

### Claude's Discretion
- UI placement within the admin config page (new SectionCard vs. separate section)
- Shape of the merged category list surfaced to the employee submission flow
- Whether `customCategories` is also surfaced through the public config endpoint

### Deferred Ideas (OUT OF SCOPE)
- CATG-04: Delete custom category
- CATG-05: Category-specific spending limit (v2)
- CATG-06: Enforcement per CC (v2 — for now, custom categories appear in the submission form but the hardcoded `Category` enum validation in POST /api/requests is NOT modified to block non-enum values; the employee simply sees and selects the custom category, but the DB still stores it as `Category` enum — see critical constraint below)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CATG-01 | Admin can view default expense categories | 12 enum values enumerated in config page CATEGORIES constant; displayed in "Allowed Categories" and "Category Rules" sections |
| CATG-02 | Admin can add custom expense category | New `customCategories` AdminConfig key; CRUD UI in admin config page |
| CATG-03 | Admin can modify category name and description | Update objects in `customCategories` JSON array via PUT /api/admin/config |
</phase_requirements>

---

## Summary

Phase 4 adds per-CC custom expense categories using the existing AdminConfig JSON storage pattern. The 12 hardcoded `Category` enum values stay as permanent defaults; a new `customCategories` AdminConfig key adds user-defined categories on top per cost center.

The approach avoids a DB migration entirely. The tradeoff is that custom category codes cannot be stored in `ReimbursementRequest.category` (that field is a Prisma `Category` enum with no extensibility). The v1 scope resolves this by treating custom categories as display/selection helpers: the admin and employee UI show them, but the submission flow must either map custom codes to the nearest enum value or store the title in a separate field (see Open Questions).

**Primary recommendation:** Store `customCategories` as a new AdminConfig key with Zod schema `z.array(z.object({ name, code, enabled }))`. Surface merged list (defaults + custom) through the public config endpoint and the admin UI. The POST /api/requests category validation remains enum-only in v1; CATG-06 enforcement is deferred to v2.

---

## Standard Stack

### Core (already in place — no new installs needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | (project dep) | Schema validation for AdminConfig values | All existing VALID_KEYS use Zod schemas in `valueSchemas` map |
| Prisma AdminConfig | existing | JSON storage for config values | Pattern established across all phases 1-3 |
| Next.js App Router | (project dep) | API routes and page rendering | Existing route at `/api/admin/config` |

### No new dependencies required for this phase.

---

## Architecture Patterns

### Existing AdminConfig Pattern (established in phases 1-3)

The `customCategories` key follows the exact same pattern as all existing keys:

1. Add the key string to `VALID_KEYS` array in `/api/admin/config/route.ts`
2. Add a Zod schema entry to `valueSchemas` map in the same file
3. Save/load via the existing PUT/GET endpoints with `costCenterId` scoping
4. Read in POST /api/requests via `getConfig(prisma, "customCategories", orgId, submitterCCId)`

### Default Category Values

The 12 default categories are defined in two places:

- `prisma/schema.prisma` — enum `Category { TRAVEL, MEALS, SUPPLIES, ACCOMMODATION, COMMUNICATION, TRAINING, ENTERTAINMENT, MEETING, EQUIPMENT, PRINTING, SOFTWARE, OTHER }`
- `src/app/(admin)/admin/config/page.tsx` line 617 — `const CATEGORIES = ["TRAVEL", "MEALS", "SUPPLIES", ...]`
- `src/app/api/requests/route.ts` line 61 — `Object.values(Category).includes(category)` guard
- `src/app/api/requests/route.ts` line 81 — `let allowedCategories: string[] = Object.values(Category)` default

### Recommended customCategories Zod Schema

```typescript
// Source: pattern from existing valueSchemas in /api/admin/config/route.ts
customCategories: z.array(
  z.object({
    name: z.string().min(1).max(60),
    code: z.string().min(1).max(30).regex(/^[A-Z0-9_]+$/),
    enabled: z.boolean(),
  })
),
```

Matching interface for TypeScript:
```typescript
interface CustomCategory {
  name: string   // e.g. "Conference Fees"
  code: string   // e.g. "CONF_FEES" — uppercase, alphanumeric+underscore
  enabled: boolean
}
```

### Admin UI Section Pattern

The config page uses the `SectionCard` component. A new "Custom Categories" section is added below the existing "Allowed Categories" section, following the same `SectionCard` pattern used for every other config key:

```tsx
// Source: existing pattern in src/app/(admin)/admin/config/page.tsx
<SectionCard
  title="Custom Categories"
  metaKey="customCategories"
  meta={meta}
  onSave={handleSaveCustomCategories}
  saving={savingCustomCategories}
>
  {/* inline add/edit list of custom categories */}
</SectionCard>
```

### Merged Category List for Submission

The employee submission flow (chat engine + public config endpoint) needs to know all available categories. The merge pattern:

```typescript
// In /api/config/public/route.ts — extend to fetch customCategories
const customCatsRaw = await getConfig(prisma, "customCategories", orgId, ccId)
const customCategories = Array.isArray(customCatsRaw)
  ? (customCatsRaw as CustomCategory[]).filter(c => c.enabled)
  : []

// Merged list: defaults first, then enabled custom categories
const allCategories = [
  ...Object.values(Category),           // 12 defaults, always present
  ...customCategories.map(c => c.code), // custom codes appended
]
```

### Recommended Project Structure Changes

```
src/
├── app/api/admin/config/route.ts      # add "customCategories" to VALID_KEYS + valueSchemas
├── app/api/config/public/route.ts     # surface customCategories in response
├── app/(admin)/admin/config/page.tsx  # new SectionCard for custom category CRUD
└── lib/submission-limits.ts           # no change needed (already uses string[] allowedCategories)
```

### Anti-Patterns to Avoid

- **Do not add a `maxAmount` property to the Zod schema in v1.** The objective prompt listed it in the example shape but CATG-05 (category-specific limits) is explicitly deferred to v2. Adding it now creates a half-implemented feature in the schema without enforcement.
- **Do not modify the Prisma `Category` enum.** The user's decision is free-text/JSON — no DB migration.
- **Do not store custom category codes in `ReimbursementRequest.category`.** That field is an enum; storing an unknown string will cause a Prisma runtime error. See Open Questions for the resolution.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Config key validation | Custom key whitelist logic | Add to `VALID_KEYS` array, `valueSchemas` map | Pattern is already established and enforced |
| CC-scoped config reads | Custom DB query | `getConfig(prisma, "customCategories", orgId, ccId)` | Three-tier precedence already implemented |
| Admin config merging | Custom merge logic | `mergeConfigs(ccRows, orgRows)` | Already implemented and tested |

---

## Common Pitfalls

### Pitfall 1: Storing Custom Category Code in ReimbursementRequest.category
**What goes wrong:** Prisma throws a runtime error when you try to store a string that's not in the `Category` enum (e.g., "CONF_FEES") in `ReimbursementRequest.category`.
**Why it happens:** `category Category` in the schema is a DB-level enum. Prisma validates values before the INSERT.
**How to avoid:** In v1, either (a) display-only — custom categories appear in the UI but when the employee selects one, the submission falls back to "OTHER" in the DB, or (b) treat custom category selection as a title/description annotation only. The critical insight is that CATG-06 (enforcement) is deferred to v2; the planner must decide how to handle this gracefully.
**Warning signs:** "Invalid value for field category" Prisma error in the POST /api/requests handler.

### Pitfall 2: Zod Schema for allowedCategories Still Rejects Custom Codes
**What goes wrong:** The existing `allowedCategories` Zod schema in `valueSchemas` is typed as `z.array(z.enum(["TRAVEL", "MEALS", ...]))` — it will reject any array that contains custom category codes.
**Why it happens:** The schema was designed for enum values only.
**How to avoid:** The `customCategories` key is a separate key from `allowedCategories`. The admin does NOT mix custom codes into the `allowedCategories` array (which remains enum-only). Custom categories live entirely in the new key.
**Warning signs:** PUT /api/admin/config with key="allowedCategories" returns 400 "Invalid value" when admin tries to add a custom code.

### Pitfall 3: chat-engine.ts detectCategory() Hardcodes Enum Values
**What goes wrong:** The `detectCategory()` function in `src/lib/chat-engine.ts` returns hardcoded enum strings ("TRAVEL", "MEALS", etc.). When a user describes an expense that matches a custom category, the chat engine cannot detect it.
**Why it happens:** The detection logic uses regex keyword matching against hardcoded category codes.
**How to avoid:** In v1, this is acceptable — custom categories just won't be auto-detected from receipt text. The employee can manually adjust the category in the chat confirmation step. No change needed in v1.

### Pitfall 4: Admin Config Page CATEGORIES Constant Not Updated
**What goes wrong:** The admin config page defines `const CATEGORIES = ["TRAVEL", ...]` as a hardcoded constant used in "Allowed Categories" and "Category Rules" sections. Adding custom categories to the admin UI requires state that includes both defaults and custom ones.
**Why it happens:** The CATEGORIES constant on line 617 of the config page is static.
**How to avoid:** Load `customCategories` from the config response alongside other keys. Compute a merged display list reactively: `const allCategoriesForDisplay = [...CATEGORIES, ...customCategories.filter(c => c.enabled).map(c => c.code)]`

---

## Code Examples

### Adding customCategories to VALID_KEYS and valueSchemas

```typescript
// Source: existing pattern in src/app/api/admin/config/route.ts
const VALID_KEYS = [
  // ...existing keys...
  "customCategories",    // NEW
] as const

const valueSchemas: Record<string, z.ZodTypeAny> = {
  // ...existing schemas...
  customCategories: z.array(        // NEW
    z.object({
      name: z.string().min(1).max(60),
      code: z.string().min(1).max(30).regex(/^[A-Z0-9_]+$/),
      enabled: z.boolean(),
    })
  ),
}
```

### Reading customCategories in POST /api/requests

```typescript
// Source: pattern from existing CC-scoped reads in src/app/api/requests/route.ts
const customCategoriesRaw = await getConfig(prisma, "customCategories", orgId, submitterCCId)
const customCategoryCodes = Array.isArray(customCategoriesRaw)
  ? (customCategoriesRaw as { code: string; enabled: boolean }[])
      .filter(c => c.enabled)
      .map(c => c.code)
  : []

// When building allowedCategories for validateSubmission():
// defaults + custom enabled codes
const effectiveAllowedCategories = [
  ...(Array.isArray(allowedCategoriesRaw) ? allowedCategoriesRaw as string[] : Object.values(Category)),
  ...customCategoryCodes,
]
```

### Admin UI: SectionCard for Custom Categories

```tsx
// Source: existing SectionCard pattern in src/app/(admin)/admin/config/page.tsx
const [customCategories, setCustomCategories] = useState<CustomCategory[]>([])
const [savingCustomCategories, setSavingCustomCategories] = useState(false)

async function handleSaveCustomCategories() {
  setSavingCustomCategories(true)
  const ok = await saveConfig("customCategories", customCategories, selectedCC?.id ?? null)
  if (ok) toast.success("Custom categories saved")
  else toast.error("Failed to save custom categories")
  setSavingCustomCategories(false)
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `allowedCategories` stores enum subset | New `customCategories` key stores extra user-defined categories | No breaking change to allowedCategories logic |
| Category displayed as `cat.charAt(0) + cat.slice(1).toLowerCase()` | Custom categories use the user-provided `name` field directly | Custom names display naturally without transformation |

---

## Open Questions

1. **How does a custom category code get stored when an employee submits a reimbursement?**
   - What we know: `ReimbursementRequest.category` is a Prisma `Category` enum — only the 12 known values are valid DB values. Storing "CONF_FEES" will throw.
   - What's unclear: The user decision says "Reimbursement submission shows default categories + CC's custom categories" — but does not specify how the DB stores custom-category submissions.
   - Recommendation for planner: Two options — (A) Custom categories are display-only in v1; when an employee selects a custom category, it maps to "OTHER" in the DB and the title/description captures the actual category context. (B) Leave a TODO comment and let CATG-06 (v2) address full enforcement with a proper schema change. Option A is safer and does not create misleading data. The planner must pick one and encode it in the plan.

2. **Should `allowedCategories` be extended to cover custom codes or kept enum-only?**
   - What we know: `allowedCategories` Zod schema only accepts enum values. `customCategories` is a separate key.
   - What's unclear: When `validateSubmission()` runs in POST /api/requests, `allowedCategories` controls which categories are permitted. If a custom category is submitted, it would fail the `allowedCategories` check unless the POST handler also loads `customCategories` and merges them before validation.
   - Recommendation: The POST handler must load both `allowedCategories` AND `customCategories`, build an effective list, and pass that to `validateSubmission()`. This is the minimal v1 change needed for custom categories to actually work end-to-end.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/lib/__tests__/submission-limits.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CATG-01 | Default categories returned when no `customCategories` config set | unit | `npx vitest run src/lib/__tests__/custom-categories.test.ts` | ❌ Wave 0 |
| CATG-02 | `customCategories` Zod schema accepts valid array, rejects invalid shapes | unit | `npx vitest run src/lib/__tests__/custom-categories.test.ts` | ❌ Wave 0 |
| CATG-03 | Merged category list (defaults + custom enabled) is computed correctly | unit | `npx vitest run src/lib/__tests__/custom-categories.test.ts` | ❌ Wave 0 |
| CATG-02/03 | Admin PUT /api/admin/config with key=customCategories persists correctly | manual | Browser DevTools / curl | n/a |
| CATG-01 | Admin UI shows 12 default categories in Allowed Categories section | manual | Browser inspection | n/a |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/__tests__/custom-categories.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/__tests__/custom-categories.test.ts` — covers CATG-01, CATG-02, CATG-03
  - Test: mergeDefaultsWithCustom() returns 12 defaults when customCategories is empty/null
  - Test: mergeDefaultsWithCustom() appends enabled custom categories to defaults
  - Test: mergeDefaultsWithCustom() excludes disabled custom categories
  - Test: Zod schema rejects array items missing required fields (name, code, enabled)
  - Test: Zod schema rejects codes with invalid characters (spaces, lowercase)
  - Test: POST /api/requests effective allowedCategories includes custom category codes

---

## Sources

### Primary (HIGH confidence)
- Codebase audit — `src/app/api/admin/config/route.ts` — VALID_KEYS, valueSchemas, PUT/GET patterns
- Codebase audit — `src/app/api/requests/route.ts` — Category enum validation, CC-scoped config reads
- Codebase audit — `src/lib/submission-limits.ts` — validateSubmission(), allowedCategories string[]
- Codebase audit — `src/app/(admin)/admin/config/page.tsx` — SectionCard pattern, CATEGORIES constant, saveConfig() helper
- Codebase audit — `src/app/api/config/public/route.ts` — public config endpoint, CC-scoped reads
- Codebase audit — `prisma/schema.prisma` — Category enum (12 values), AdminConfig model

### Secondary (MEDIUM confidence)
- Codebase audit — `src/lib/__tests__/submission-limits.test.ts` — Vitest patterns and test conventions used in this project

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all patterns directly observed in the codebase, no inference
- Architecture: HIGH — VALID_KEYS + valueSchemas + SectionCard pattern is thoroughly established
- Pitfalls: HIGH — Category enum constraint is a hard DB fact; allowedCategories Zod schema is directly readable

**Research date:** 2026-05-14
**Valid until:** 2026-06-14 (stable codebase — 30 days)
