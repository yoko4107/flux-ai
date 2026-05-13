---
phase: 03-per-cc-policies-deadlines
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified:
  - src/lib/__tests__/submission-limits.test.ts
  - src/lib/submission-limits.ts
  - src/app/api/admin/config/route.ts
  - src/app/api/requests/route.ts
  - src/app/(admin)/admin/config/page.tsx
autonomous: true
requirements:
  - LMIT-01
  - LMIT-02
  - LMIT-03
  - LMIT-04
  - LMIT-05

must_haves:
  truths:
    - "Submitting a request over maxAmountPerRequest returns 400 with details array"
    - "Submitting a request under approvalThreshold auto-approves without creating approval steps"
    - "Config enforcement at submission uses the submitter's CC config, not org-wide rows"
    - "Admin can save maxAmountPerRequest and approvalThreshold from the config UI"
    - "Category limit enforcement reads per-CC config (not global findMany)"
  artifacts:
    - path: "src/lib/__tests__/submission-limits.test.ts"
      provides: "Unit tests for validateSubmission() and isOverduePayment() helpers"
      min_lines: 60
    - path: "src/lib/submission-limits.ts"
      provides: "Pure validateSubmission() and isOverduePayment() helpers"
      exports: ["validateSubmission", "isOverduePayment"]
    - path: "src/app/api/admin/config/route.ts"
      provides: "maxAmountPerRequest, paymentDeadline, approvalThreshold in VALID_KEYS + valueSchemas"
      contains: "maxAmountPerRequest"
    - path: "src/app/api/requests/route.ts"
      provides: "CC-scoped getConfig() calls replacing broken findMany() block"
      contains: "getConfig"
  key_links:
    - from: "src/app/api/requests/route.ts"
      to: "src/lib/config.ts"
      via: "getConfig(prisma, key, orgId, ccId)"
      pattern: "getConfig\\(prisma"
    - from: "src/app/api/requests/route.ts"
      to: "src/lib/submission-limits.ts"
      via: "validateSubmission(amount, category, config)"
      pattern: "validateSubmission"
---

<objective>
Fix CC-scoped limit enforcement at submission time and add new configurable limits.

Purpose: The POST /api/requests route currently reads AdminConfig with a bare prisma.adminConfig.findMany() — no org or CC scope — causing limits to be non-deterministic across orgs. This plan fixes that bug, extracts limit logic to a testable pure helper, adds two new AdminConfig keys (maxAmountPerRequest, approvalThreshold), and adds admin UI fields for them.

Output:
- src/lib/__tests__/submission-limits.test.ts (Wave 0 test stubs, failing before implementation)
- src/lib/submission-limits.ts (pure validateSubmission + isOverduePayment helpers)
- src/app/api/admin/config/route.ts (3 new VALID_KEYS entries)
- src/app/api/requests/route.ts (CC-scoped getConfig() block, auto-approve logic)
- src/app/(admin)/admin/config/page.tsx (two new input fields, save handler extension)
</objective>

<execution_context>
@/Users/yokosimon/.claude/get-shit-done/workflows/execute-plan.md
@/Users/yokosimon/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/03-per-cc-policies-deadlines/03-RESEARCH.md
@.planning/phases/03-per-cc-policies-deadlines/03-VALIDATION.md

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from codebase. -->

From src/lib/config.ts:
```typescript
export async function getConfig(
  prisma: PrismaClient,
  key: string,
  orgId?: string | null,
  costCenterId?: string | null
): Promise<unknown>
// Returns: CC row > org row > global row, or null if none found
```

From src/app/api/admin/config/route.ts (current VALID_KEYS):
```typescript
const VALID_KEYS = [
  "approvalCommittee",
  "submissionDeadline",    // z.number().int().min(1).max(31) — bare number, day of month
  "approvalDeadline",      // z.number().int().min(1) — bare number, business days
  "allowedCategories",
  "maxAmountPerCategory",  // z.record(z.string(), z.number())
  "requireReceiptAbove",
  "notificationChannels",
  "resubmitBehavior",
  "financeOfficer",
] as const
```

From src/app/api/requests/route.ts (current broken block to REPLACE at line 72-85):
```typescript
// CURRENT — BROKEN (no CC scope): replace entirely
const configs = await prisma.adminConfig.findMany()
const configMap: Record<string, unknown> = {}
for (const c of configs) {
  configMap[c.key] = c.value
}
const submissionDeadlineConfig = configMap.submissionDeadline as { day?: number } | null
const submissionDeadline = submissionDeadlineConfig?.day ?? null
const allowedCategoriesConfig = configMap.allowedCategories as { categories?: string[] } | null
const allowedCategories = allowedCategoriesConfig?.categories ?? Object.values(Category)
const maxAmountPerCategory = (configMap.maxAmountPerCategory as Record<string, number>) ?? {}
const requireReceiptAboveConfig = configMap.requireReceiptAbove as { amount?: number } | null
const requireReceiptAbove = requireReceiptAboveConfig?.amount ?? null
```

The submitter's costCenterId is already resolved later (line 162-166). Move that resolution BEFORE the config block.

Session already exposes session.user.organizationId (used at line 170 for resolveCommittee).

From src/lib/__tests__/approval-routing.test.ts (vi.mock pattern to replicate):
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
vi.mock("@/lib/config", () => ({
  getConfig: vi.fn(),
}))
import { getConfig } from "@/lib/config"
const mockGetConfig = vi.mocked(getConfig)
```

From src/app/(admin)/admin/config/page.tsx (existing save handler pattern):
```typescript
async function handleSaveDeadlines() {
  setSavingDeadlines(true)
  const [ok1, ok2] = await Promise.all([
    saveConfig("submissionDeadline", submissionDeadline, selectedCC?.id ?? null),
    saveConfig("approvalDeadline", approvalDeadline, selectedCC?.id ?? null),
  ])
  if (ok1 && ok2) toast.success("Deadlines saved")
  else toast.error("Failed to save deadlines")
  setSavingDeadlines(false)
}
// Pattern: saveConfig(key, value, costCenterId) — costCenterId captured at call time
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 (Wave 0): Create failing test stubs for submission limit helpers</name>
  <files>src/lib/__tests__/submission-limits.test.ts</files>
  <behavior>
    - Test: validateSubmission blocks when amount > maxAmountPerRequest, returns error string containing "exceeds"
    - Test: validateSubmission allows when amount == maxAmountPerRequest (boundary)
    - Test: validateSubmission blocks over category limit, returns error mentioning category name
    - Test: validateSubmission allows when category not in maxAmountPerCategory map
    - Test: validateSubmission returns details array (not a single string) — LMIT-05
    - Test: shouldAutoApprove returns true when amount <= approvalThreshold (> 0)
    - Test: shouldAutoApprove returns false when approvalThreshold is 0 (disabled)
    - Test: shouldAutoApprove returns false when amount > approvalThreshold
    - Test: isOverduePayment returns true when now is past (approvedAt + paymentDeadlineDays business days)
    - Test: isOverduePayment returns false when still within deadline
    - Test: isOverduePayment returns false when paymentDeadlineDays is null (not configured)
    - Test: submissionDeadline read as bare number (not { day: number }) — shape bug regression
  </behavior>
  <action>
    Create src/lib/__tests__/submission-limits.test.ts with all tests FAILING (import the not-yet-created helpers so tests red).

    Import structure:
    ```typescript
    import { describe, it, expect } from "vitest"
    import { validateSubmission, shouldAutoApprove, isOverduePayment } from "../submission-limits"
    ```

    The file src/lib/submission-limits.ts does NOT exist yet — tests will fail to compile/run. That is the correct Wave 0 state.

    Do NOT create src/lib/submission-limits.ts yet — that is Task 2.

    Write describe blocks:
    - describe("validateSubmission") — tests for per-request limit, per-category limit, details shape
    - describe("shouldAutoApprove") — tests for threshold logic
    - describe("isOverduePayment") — tests for business-day overdue detection, null guard

    The isOverduePayment helper needs an addBusinessDays utility. Include tests that verify the business-days calculation skips weekends (e.g., Friday + 1 business day = Monday, not Saturday).
  </action>
  <verify>
    <automated>cd "/Users/yokosimon/Reimbursement Apps/reimbursement-app/.claude/worktrees/dreamy-jones-22d72f" && npx vitest run src/lib/__tests__/submission-limits.test.ts 2>&1 | tail -5</automated>
    Expected: test run fails with import/module error or compilation error (file not found). Green tests here would mean tests are wrong.
  </verify>
  <done>src/lib/__tests__/submission-limits.test.ts exists with 12+ failing test cases that will pass once Task 2 creates the implementation.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement validateSubmission, shouldAutoApprove, isOverduePayment helpers + extend VALID_KEYS</name>
  <files>src/lib/submission-limits.ts, src/app/api/admin/config/route.ts</files>
  <behavior>
    - validateSubmission(amount, category, config) returns string[] (empty = valid)
    - shouldAutoApprove(amount, approvalThreshold) returns boolean
    - isOverduePayment(approvedAt, paymentDeadlineDays, now) returns boolean
    - All Task 1 tests go GREEN after this task
  </behavior>
  <action>
    CREATE src/lib/submission-limits.ts with three pure exported functions:

    ```typescript
    export interface SubmissionConfig {
      maxAmountPerRequest: number | null   // 0 = no limit
      maxAmountPerCategory: Record<string, number>
      approvalThreshold: number | null     // 0 = disabled
      submissionDeadline: number | null    // day of month (bare number)
      allowedCategories: string[]
      requireReceiptAbove: number | null
    }

    export function validateSubmission(
      amount: number,
      category: string,
      receiptUrl: string | null,
      config: SubmissionConfig,
      todayDate: Date = new Date()
    ): string[]

    export function shouldAutoApprove(
      amount: number,
      approvalThreshold: number | null
    ): boolean

    export function isOverduePayment(
      approvedAt: Date,
      paymentDeadlineDays: number | null,
      now: Date = new Date()
    ): boolean
    ```

    validateSubmission logic (in order):
    1. If category not in config.allowedCategories: push error "Category X is not allowed."
    2. If config.maxAmountPerCategory[category] != null && amount > it: push error "Amount X exceeds maximum of Y for category Z."
    3. If config.maxAmountPerRequest != null && config.maxAmountPerRequest > 0 && amount > config.maxAmountPerRequest: push error "Amount X exceeds overall request limit of Y."
    4. If config.requireReceiptAbove != null && amount > it && !receiptUrl: push error "A receipt is required for amounts above X."
    5. If config.submissionDeadline != null && todayDate.getDate() > config.submissionDeadline: push error "Submission deadline (day X of the month) has passed."
    6. Return errors array.

    shouldAutoApprove: return approvalThreshold != null && approvalThreshold > 0 && amount <= approvalThreshold

    isOverduePayment: if paymentDeadlineDays is null, return false. Add paymentDeadlineDays business days to approvedAt (copy addBusinessDays from admin/page.tsx: increment day-by-day, skip Saturday=6 and Sunday=0). Return businessDeadline <= now.

    ALSO update src/app/api/admin/config/route.ts:
    - Add to VALID_KEYS array: "maxAmountPerRequest", "paymentDeadline", "approvalThreshold"
    - Add to valueSchemas: maxAmountPerRequest: z.number().min(0), paymentDeadline: z.number().int().min(1), approvalThreshold: z.number().min(0)
  </action>
  <verify>
    <automated>cd "/Users/yokosimon/Reimbursement Apps/reimbursement-app/.claude/worktrees/dreamy-jones-22d72f" && npx vitest run src/lib/__tests__/submission-limits.test.ts 2>&1 | tail -10</automated>
    Expected: all tests PASS. Zero failures.
  </verify>
  <done>All submission-limits.test.ts tests green. VALID_KEYS in route.ts contains the three new keys. npx tsc --noEmit passes.</done>
</task>

<task type="auto">
  <name>Task 3: Fix POST /api/requests — CC-scoped config, auto-approve, new limit checks, admin UI fields</name>
  <files>src/app/api/requests/route.ts, src/app/(admin)/admin/config/page.tsx</files>
  <action>
    PART A — Fix src/app/api/requests/route.ts:

    1. Add import at top:
       ```typescript
       import { getConfig } from "@/lib/config"
       import { validateSubmission, shouldAutoApprove } from "@/lib/submission-limits"
       ```

    2. Move the submitter resolution BEFORE the config block (currently at line 162). The submitter fetch needs costCenterId AND organizationId for getConfig:
       ```typescript
       const submitter = await prisma.user.findUnique({
         where: { id: session.user.id },
         select: { costCenterId: true, organizationId: true },
       })
       const submitterCCId = submitter?.costCenterId ?? null
       const orgId = submitter?.organizationId ?? session.user.organizationId ?? null
       ```
       Remove the duplicate submitter fetch that currently exists at line 162.

    3. REPLACE the broken findMany() block (lines 72-85) entirely with CC-scoped getConfig() calls:
       ```typescript
       const [submissionDeadlineRaw, allowedCategoriesRaw, maxAmtPerCatRaw,
              requireReceiptRaw, maxAmtPerReqRaw, approvalThreshRaw] =
         await Promise.all([
           getConfig(prisma, "submissionDeadline", orgId, submitterCCId),
           getConfig(prisma, "allowedCategories", orgId, submitterCCId),
           getConfig(prisma, "maxAmountPerCategory", orgId, submitterCCId),
           getConfig(prisma, "requireReceiptAbove", orgId, submitterCCId),
           getConfig(prisma, "maxAmountPerRequest", orgId, submitterCCId),
           getConfig(prisma, "approvalThreshold", orgId, submitterCCId),
         ])

       // Fix shape bugs: all stored as bare numbers, NOT as { day: number } objects
       const submissionDeadline = typeof submissionDeadlineRaw === "number" ? submissionDeadlineRaw : null
       const allowedCategories = Array.isArray(allowedCategoriesRaw) ? allowedCategoriesRaw : Object.values(Category)
       const maxAmountPerCategory = (maxAmtPerCatRaw as Record<string, number>) ?? {}
       const requireReceiptAbove = typeof requireReceiptRaw === "number" ? requireReceiptRaw : null
       const maxAmountPerRequest = typeof maxAmtPerReqRaw === "number" ? maxAmtPerReqRaw : null
       const approvalThreshold = typeof approvalThreshRaw === "number" ? approvalThreshRaw : null
       ```

    4. Replace the manual validation checks (lines 91-114) with a call to validateSubmission:
       ```typescript
       const errors = validateSubmission(Number(amount), category, receiptUrl ?? null, {
         maxAmountPerRequest,
         maxAmountPerCategory,
         approvalThreshold,
         submissionDeadline,
         allowedCategories,
         requireReceiptAbove,
       })
       if (errors.length > 0) {
         return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 })
       }
       ```

    5. After request creation (after the `prisma.reimbursementRequest.create` call) and BEFORE the approval step creation block, add auto-approve logic:
       ```typescript
       if (status === "SUBMITTED" && shouldAutoApprove(Number(amount), approvalThreshold)) {
         await prisma.reimbursementRequest.update({
           where: { id: request.id },
           data: { status: "APPROVED", updatedAt: new Date() },
         })
         await writeAuditLog(prisma, {
           requestId: request.id,
           actorId: session.user.id,
           action: "REQUEST_APPROVED",
           details: { reason: "auto-approved: amount below approvalThreshold", amount: Number(amount) },
         })
         return NextResponse.json({ ...request, status: "APPROVED" }, { status: 201 })
       }
       ```
       This early return skips approval step creation and committee notification — auto-approved requests are fully approved immediately. (Finance Officer payment still required — that's a separate flow.)

    PART B — Update src/app/(admin)/admin/config/page.tsx:

    1. Add two new state variables near the existing deadline state vars:
       ```typescript
       const [maxAmountPerRequest, setMaxAmountPerRequest] = useState<number>(0)
       const [approvalThreshold, setApprovalThreshold] = useState<number>(0)
       ```

    2. In the config load effect (where submissionDeadline and approvalDeadline are read from fetched config), add:
       ```typescript
       if (typeof config.maxAmountPerRequest === "number") setMaxAmountPerRequest(config.maxAmountPerRequest)
       if (typeof config.approvalThreshold === "number") setApprovalThreshold(config.approvalThreshold)
       ```

    3. Extend handleSaveDeadlines (or create handleSaveLimits — match whichever section is appropriate) to save the two new keys:
       ```typescript
       saveConfig("maxAmountPerRequest", maxAmountPerRequest, selectedCC?.id ?? null),
       saveConfig("approvalThreshold", approvalThreshold, selectedCC?.id ?? null),
       ```
       Add these to an existing Promise.all save block, or create a dedicated "Save Limits" handler if limits are in a separate section.

    4. Add two number input fields in the Spending Limits section of the config UI (find the section with requireReceiptAbove):
       - Label: "Overall Request Limit" / helper text: "Maximum amount per reimbursement request (0 = no limit)"
       - Input: type="number" min="0" step="1" value={maxAmountPerRequest} onChange={(e) => setMaxAmountPerRequest(Number(e.target.value))}
       - Label: "Auto-Approve Threshold" / helper text: "Requests at or below this amount skip approvers (0 = disabled)"
       - Input: type="number" min="0" step="1" value={approvalThreshold} onChange={(e) => setApprovalThreshold(Number(e.target.value))}

    Also fix the shape mismatch bug in the employee requests page:
    In src/app/(employee)/employee/requests/page.tsx, find line 98-99:
    ```typescript
    // OLD (wrong — expects object):
    if (configs.submissionDeadline?.day) {
      setSubmissionDeadlineDay(configs.submissionDeadline.day)
    }
    // NEW (correct — bare number):
    if (typeof configs.submissionDeadline === "number") {
      setSubmissionDeadlineDay(configs.submissionDeadline)
    }
    ```
    Also fix src/app/api/config/public/route.ts if it wraps submissionDeadline in an object before returning — check and fix if so.
  </action>
  <verify>
    <automated>cd "/Users/yokosimon/Reimbursement Apps/reimbursement-app/.claude/worktrees/dreamy-jones-22d72f" && npx tsc --noEmit 2>&1 | head -20 && npx vitest run src/lib/__tests__/submission-limits.test.ts 2>&1 | tail -5</automated>
    Expected: tsc exits 0, all submission-limits tests green.
  </verify>
  <done>
    - POST /api/requests uses getConfig() with submitter's orgId + costCenterId for all enforcement keys
    - Requests over maxAmountPerRequest (when > 0) return 400 with details array
    - Requests under approvalThreshold (when > 0) return 201 with status=APPROVED, no approval steps created
    - Shape bugs fixed: submissionDeadline and approvalDeadline read as bare numbers everywhere
    - Admin UI shows Overall Request Limit and Auto-Approve Threshold fields that save per CC
    - npx tsc --noEmit passes
  </done>
</task>

</tasks>

<verification>
Full test suite green: `npx vitest run`

Config route has three new keys: `grep -c "maxAmountPerRequest\|paymentDeadline\|approvalThreshold" src/app/api/admin/config/route.ts` returns 3+

Requests route uses getConfig: `grep -c "getConfig" src/app/api/requests/route.ts` returns 6+ (one per config key)

No findMany without scope in hot path: `grep "adminConfig.findMany()" src/app/api/requests/route.ts` returns nothing
</verification>

<success_criteria>
1. All tests in src/lib/__tests__/submission-limits.test.ts pass (validateSubmission, shouldAutoApprove, isOverduePayment)
2. POST /api/requests reads config with getConfig() using submitter's CC — not bare findMany()
3. Submission over maxAmountPerRequest (configured > 0) returns 400 with { error, details: string[] }
4. Submission under approvalThreshold returns 201 with status=APPROVED and zero approval steps in DB
5. Admin can save maxAmountPerRequest and approvalThreshold from /admin/config per CC
6. npx tsc --noEmit and npx vitest run both exit 0
</success_criteria>

<output>
After completion, create `.planning/phases/03-per-cc-policies-deadlines/03-01-SUMMARY.md` documenting:
- Files created/modified
- Key decisions made (especially approvalThreshold auto-approve behavior)
- Shape bugs fixed (submissionDeadline bare number)
- Patterns established for Plan 02
</output>
