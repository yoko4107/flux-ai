---
phase: 04-custom-expense-categories
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/__tests__/custom-categories.test.ts
  - src/lib/custom-categories.ts
  - src/app/api/admin/config/route.ts
  - src/app/api/config/public/route.ts
  - src/app/api/requests/route.ts
autonomous: true
requirements:
  - CATG-01
  - CATG-02
  - CATG-03

must_haves:
  truths:
    - "mergeCategories() returns 12 enum defaults when customCategories is empty or null"
    - "mergeCategories() appends only enabled custom categories to the 12 defaults"
    - "mergeCategories() excludes disabled custom categories from the merged list"
    - "PUT /api/admin/config with key=customCategories accepts a valid array and rejects invalid shapes"
    - "GET /api/config/public returns a customCategories field with enabled custom entries for the caller's CC"
    - "POST /api/requests allows a custom category code that is enabled in the submitter's CC"
  artifacts:
    - path: "src/lib/__tests__/custom-categories.test.ts"
      provides: "Failing unit test stubs for mergeCategories() and Zod schema (Wave 0)"
      min_lines: 40
    - path: "src/lib/custom-categories.ts"
      provides: "CustomCategory interface, customCategorySchema, mergeCategories() pure helper"
      exports: ["CustomCategory", "customCategorySchema", "mergeCategories"]
    - path: "src/app/api/admin/config/route.ts"
      provides: "customCategories added to VALID_KEYS and valueSchemas"
      contains: "customCategories"
    - path: "src/app/api/config/public/route.ts"
      provides: "customCategories field included in public config GET response"
      contains: "customCategories"
    - path: "src/app/api/requests/route.ts"
      provides: "POST handler merges customCategories into allowedCategories before validateSubmission(); custom category mapped to OTHER in DB"
      contains: "customCategories"
  key_links:
    - from: "src/app/api/requests/route.ts"
      to: "src/lib/custom-categories.ts"
      via: "mergeCategories(defaults, customCategoriesRaw)"
      pattern: "mergeCategories"
    - from: "src/app/api/config/public/route.ts"
      to: "src/lib/config.ts"
      via: "getConfig(prisma, 'customCategories', orgId, ccId)"
      pattern: "customCategories"
---

<objective>
Add the customCategories AdminConfig key and wire it into the submission and public-config paths.

Purpose: This is the backend foundation for Phase 4. It introduces the CustomCategory type, a pure mergeCategories() helper, registers the new key in the config API, surfaces it through the public endpoint (so the employee form can display custom categories), and updates POST /api/requests so that a custom category code is accepted during validation. v1 constraint: ReimbursementRequest.category is a Prisma enum — when an employee submits with a custom category code the DB field is stored as "OTHER" (the category title in description carries the actual name).

Output:
- src/lib/__tests__/custom-categories.test.ts (Wave 0 failing stubs)
- src/lib/custom-categories.ts (CustomCategory type + mergeCategories helper)
- src/app/api/admin/config/route.ts (customCategories in VALID_KEYS + valueSchemas)
- src/app/api/config/public/route.ts (returns customCategories field)
- src/app/api/requests/route.ts (merges custom codes before validation, maps to OTHER in DB)
</objective>

<execution_context>
@/Users/yokosimon/.claude/get-shit-done/workflows/execute-plan.md
@/Users/yokosimon/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/04-custom-expense-categories/04-RESEARCH.md
@.planning/phases/04-custom-expense-categories/04-VALIDATION.md

<interfaces>
<!-- Key contracts the executor must reference. Extracted from codebase. -->

From src/lib/__tests__/submission-limits.test.ts (Vitest pattern for this project):
```typescript
import { describe, it, expect } from "vitest"
import { functionUnderTest } from "../module-under-test"

describe("functionName", () => {
  it("description of behavior", () => {
    const result = functionUnderTest(input)
    expect(result).toBe(expected)
  })
})
```

From src/app/api/admin/config/route.ts (VALID_KEYS and valueSchemas — add after "approvalThreshold"):
```typescript
const VALID_KEYS = [
  "approvalCommittee", "submissionDeadline", "approvalDeadline",
  "allowedCategories", "maxAmountPerCategory", "requireReceiptAbove",
  "notificationChannels", "resubmitBehavior", "financeOfficer",
  "maxAmountPerRequest", "paymentDeadline", "approvalThreshold",
  // ADD: "customCategories"
] as const

const valueSchemas: Record<string, z.ZodTypeAny> = {
  // existing entries...
  // ADD:
  customCategories: z.array(
    z.object({
      name: z.string().min(1).max(60),
      code: z.string().min(1).max(30).regex(/^[A-Z0-9_]+$/),
      enabled: z.boolean(),
    })
  ),
}
```

From src/app/api/config/public/route.ts (existing GET shape — add customCategories):
```typescript
// Existing Promise.all already fetches 6 keys with getConfig(prisma, key, orgId, ccId)
// Add getConfig(prisma, "customCategories", orgId, ccId) to the Promise.all
// Extend result object with:
customCategories: Array.isArray(customCategoriesRaw)
  ? (customCategoriesRaw as { name: string; code: string; enabled: boolean }[]).filter(c => c.enabled)
  : [],
```

From src/app/api/requests/route.ts (POST handler — existing allowedCategories block, line ~81-102):
```typescript
// EXISTING (line 61) — enum guard to REMOVE and replace with merged check:
if (!Object.values(Category).includes(category)) {
  return NextResponse.json({ error: "Invalid category" }, { status: 400 })
}

// EXISTING allowedCategories build (line 81-102):
let allowedCategories: string[] = Object.values(Category)
// After loading allowedCategoriesRaw from getConfig, ALSO load customCategories:
const customCategoriesRaw = await getConfig(prisma, "customCategories", orgId, submitterCCId)
// Merge into effectiveAllowedCategories before passing to validateSubmission()

// v1 DB constraint: ReimbursementRequest.category is a Prisma Category enum.
// Map custom category code → "OTHER" before prisma.reimbursementRequest.create():
const dbCategory = Object.values(Category).includes(category as Category)
  ? (category as Category)
  : Category.OTHER
```

From src/lib/config.ts (getConfig signature):
```typescript
export async function getConfig(
  prisma: PrismaClient,
  key: string,
  orgId: string | null,
  ccId: string | null
): Promise<unknown>
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 (Wave 0): Create failing test stubs for mergeCategories()</name>
  <files>src/lib/__tests__/custom-categories.test.ts</files>
  <behavior>
    - Test: mergeCategories([], null) returns array of exactly 12 strings matching Object.values(Category)
    - Test: mergeCategories([{name:"Conf",code:"CONF",enabled:true}], null) returns 13 entries, last is "CONF"
    - Test: mergeCategories([{name:"Conf",code:"CONF",enabled:false}], null) returns exactly 12 entries (disabled excluded)
    - Test: mergeCategories([{name:"Conf",code:"CONF",enabled:true},{name:"X",code:"TRAVEL",enabled:true}], null) does NOT deduplicate — custom "TRAVEL" appears after enum "TRAVEL" (no dedup in v1)
    - Test: customCategorySchema.parse({name:"Conf",code:"CONF_FEES",enabled:true}) succeeds
    - Test: customCategorySchema.parse({name:"Conf",code:"conf fees",enabled:true}) throws (lowercase + space)
    - Test: customCategorySchema.parse({name:"",code:"CONF",enabled:true}) throws (empty name)
  </behavior>
  <action>
    Create src/lib/__tests__/custom-categories.test.ts with Vitest import pattern matching the project convention (see submission-limits.test.ts). Import `mergeCategories` and `customCategorySchema` from `"../custom-categories"`. Write all 7 test cases above. Run the test suite — all tests MUST fail with import error (module does not exist yet). This is the required Wave 0 state: red before implementation.

    Use pattern: `import { describe, it, expect } from "vitest"` (no beforeEach needed for pure functions).
    Do NOT create the implementation file yet.
  </action>
  <verify>
    <automated>npm test -- --run src/lib/__tests__/custom-categories.test.ts 2>&1 | grep -E "FAIL|Cannot find module|failed"</automated>
  </verify>
  <done>Test file exists. Running the test command shows "Cannot find module" or similar import failure — tests are red, not green. No implementation file exists yet.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement custom-categories.ts and register customCategories in config API</name>
  <files>src/lib/custom-categories.ts, src/app/api/admin/config/route.ts</files>
  <behavior>
    - mergeCategories(customCats, enabledOverrides) returns string[] with 12 defaults first, then enabled custom codes appended
    - customCategorySchema validates {name, code, enabled} with constraints from RESEARCH.md
    - VALID_KEYS in route.ts includes "customCategories"
    - valueSchemas["customCategories"] matches the Zod schema in interfaces block
  </behavior>
  <action>
    1. Create src/lib/custom-categories.ts:
       - Export interface `CustomCategory { name: string; code: string; enabled: boolean }`
       - Export `customCategorySchema` — z.object with name (string min 1 max 60), code (string min 1 max 30 regex /^[A-Z0-9_]+$/), enabled (boolean)
       - Import `Category` from `"@/generated/prisma"`
       - Export `mergeCategories(customCategories: CustomCategory[] | null | unknown): string[]`:
         - Start with `const defaults = Object.values(Category) as string[]`
         - If customCategories is not an array, return defaults
         - Append only `c.code` where `c.enabled === true`
         - Return `[...defaults, ...enabled.map(c => c.code)]`
       - Do NOT add maxAmount property — CATG-05 is deferred to v2

    2. Edit src/app/api/admin/config/route.ts:
       - Add `"customCategories"` to the VALID_KEYS array (after "approvalThreshold")
       - Add `customCategories: z.array(z.object({ name: z.string().min(1).max(60), code: z.string().min(1).max(30).regex(/^[A-Z0-9_]+$/), enabled: z.boolean() }))` to valueSchemas
       - No other changes to the file

    Run tests after implementing. All 7 tests must be green.
  </action>
  <verify>
    <automated>npm test -- --run src/lib/__tests__/custom-categories.test.ts</automated>
  </verify>
  <done>All 7 tests pass. `grep -n "customCategories" src/app/api/admin/config/route.ts` shows the key in both VALID_KEYS and valueSchemas.</done>
</task>

<task type="auto">
  <name>Task 3: Wire customCategories into public config endpoint and POST /api/requests</name>
  <files>src/app/api/config/public/route.ts, src/app/api/requests/route.ts</files>
  <action>
    **src/app/api/config/public/route.ts:**
    - Add `import { mergeCategories } from "@/lib/custom-categories"` at the top
    - Add `getConfig(prisma, "customCategories", orgId, ccId)` to the existing Promise.all (makes it 7 concurrent fetches)
    - Destructure the new result as `customCategoriesRaw`
    - In the result object, add:
      ```typescript
      customCategories: Array.isArray(customCategoriesRaw)
        ? (customCategoriesRaw as { name: string; code: string; enabled: boolean }[]).filter(c => c.enabled)
        : [],
      allCategories: mergeCategories(customCategoriesRaw),
      ```
    - `customCategories` = the raw enabled custom entries (for admin display)
    - `allCategories` = merged defaults + enabled custom codes (for employee submission form)

    **src/app/api/requests/route.ts:**
    - Add `import { mergeCategories } from "@/lib/custom-categories"` at the top
    - REMOVE the early enum-only guard at line 61 (`if (!Object.values(Category).includes(category))`). This guard blocks custom category codes before CC-scoped config is loaded.
    - In the `if (status === "SUBMITTED")` block, add `getConfig(prisma, "customCategories", orgId, submitterCCId)` to the existing Promise.all. Destructure as `customCategoriesRaw`.
    - Replace the `allowedCategories` assignment:
      ```typescript
      const baseAllowed = Array.isArray(allowedCategoriesRaw)
        ? allowedCategoriesRaw as string[]
        : Object.values(Category)
      allowedCategories = mergeCategories(customCategoriesRaw).filter(code =>
        baseAllowed.includes(code) || !Object.values(Category).includes(code as Category)
      )
      ```
      Rationale: enum categories are filtered by allowedCategories config; custom categories are always included if enabled (they are not in the enum, so they pass through).

      Simpler alternative if the above is too complex — just concatenate:
      ```typescript
      allowedCategories = [
        ...(Array.isArray(allowedCategoriesRaw) ? allowedCategoriesRaw as string[] : Object.values(Category)),
        ...mergeCategories(customCategoriesRaw).filter(code => !Object.values(Category).includes(code as Category)),
      ]
      ```
      Use the simpler alternative.

    - ALSO add a category guard outside the SUBMITTED block (replace the removed enum-only guard):
      ```typescript
      // Allow both enum values AND custom category codes (validated against CC config when SUBMITTED)
      // For DRAFT status, accept any non-empty string that looks like a category code
      const isEnumCategory = Object.values(Category).includes(category as Category)
      const isCustomCategoryCode = /^[A-Z0-9_]+$/.test(category)
      if (!isEnumCategory && !isCustomCategoryCode) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 })
      }
      ```

    - v1 DB constraint: Before `prisma.reimbursementRequest.create(...)`, map custom category to OTHER:
      ```typescript
      const dbCategory: Category = Object.values(Category).includes(category as Category)
        ? (category as Category)
        : Category.OTHER
      ```
      Use `dbCategory` (not `category`) in the `prisma.reimbursementRequest.create()` call's `category` field.

    - Run full test suite after changes.
  </action>
  <verify>
    <automated>npm test -- --run && grep -n "customCategories" src/app/api/config/public/route.ts && grep -n "mergeCategories" src/app/api/requests/route.ts</automated>
  </verify>
  <done>Full test suite passes. Both files contain the customCategories integration. `npx tsc --noEmit` exits 0.</done>
</task>

</tasks>

<verification>
Run full suite: `npm test -- --run`

Type-check: `npx tsc --noEmit`

Structural checks:
- `grep -n "customCategories" src/app/api/admin/config/route.ts` — appears in VALID_KEYS array AND valueSchemas object
- `grep -n "customCategories" src/app/api/config/public/route.ts` — appears in Promise.all and result object
- `grep -n "mergeCategories" src/app/api/requests/route.ts` — used when building effectiveAllowedCategories
- `grep -n "dbCategory" src/app/api/requests/route.ts` — used in prisma.reimbursementRequest.create()
- `grep -rn "import.*custom-categories" src/` — at least 2 imports (requests + public routes)
</verification>

<success_criteria>
- All 7 unit tests in custom-categories.test.ts pass
- Full vitest suite is green
- TypeScript compiles without errors
- customCategories key registered in both VALID_KEYS and valueSchemas
- Public config endpoint returns customCategories and allCategories fields
- POST /api/requests accepts custom category codes for enabled categories, maps to OTHER in DB
- No maxAmount in CustomCategory type (CATG-05 deferred)
- No Prisma schema changes (free-text/JSON approach, user-mandated)
</success_criteria>

<output>
After completion, create `.planning/phases/04-custom-expense-categories/04-01-SUMMARY.md` following the summary template at @/Users/yokosimon/.claude/get-shit-done/templates/summary.md
</output>
