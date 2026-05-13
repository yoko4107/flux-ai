---
phase: 03-per-cc-policies-deadlines
plan: 02
type: execute
wave: 2
depends_on:
  - 03-01-limit-enforcement-PLAN.md
files_modified:
  - src/app/(admin)/admin/config/page.tsx
  - src/app/(admin)/admin/page.tsx
  - src/app/(employee)/employee/requests/[id]/page.tsx
  - src/app/api/config/public/route.ts
autonomous: true
requirements:
  - DEAD-01
  - DEAD-02
  - DEAD-03
  - DEAD-04
  - DEAD-05

must_haves:
  truths:
    - "Admin can configure paymentDeadline (business days) per cost center from the Deadlines section"
    - "Admin dashboard shows overdue APPROVED requests that have passed their payment deadline"
    - "Employee sees approval and payment deadline status on the individual request detail page"
    - "Public config endpoint returns approvalDeadline and paymentDeadline CC-scoped to the caller"
  artifacts:
    - path: "src/app/(admin)/admin/config/page.tsx"
      provides: "paymentDeadline number input field, save handler includes paymentDeadline"
      contains: "paymentDeadline"
    - path: "src/app/(admin)/admin/page.tsx"
      provides: "Overdue payments section showing APPROVED requests past paymentDeadline"
      contains: "overduePayments"
    - path: "src/app/(employee)/employee/requests/[id]/page.tsx"
      provides: "Deadline status display for approval and payment deadlines"
      contains: "approvalDeadline"
    - path: "src/app/api/config/public/route.ts"
      provides: "approvalDeadline and paymentDeadline fields in response, CC-scoped"
      contains: "paymentDeadline"
  key_links:
    - from: "src/app/(admin)/admin/page.tsx"
      to: "prisma.reimbursementRequest"
      via: "query APPROVED requests, use updatedAt as approvedAt proxy, filter by paymentDeadline business days"
      pattern: "status.*APPROVED"
    - from: "src/app/(employee)/employee/requests/[id]/page.tsx"
      to: "/api/config/public"
      via: "fetch in useEffect to read approvalDeadline + paymentDeadline"
      pattern: "config/public"
---

<objective>
Add payment deadline config UI, surface deadline status to employees on request detail, and flag overdue payments in admin dashboard.

Purpose: DEAD-01 and DEAD-02 (submissionDeadline, approvalDeadline) already exist in AdminConfig and are CC-scoped by Phase 1. This plan adds the paymentDeadline admin UI field (DEAD-03), exposes deadline fields in the public config endpoint for employee consumption, shows approval and payment deadline status on the employee request detail page (DEAD-04), and adds an overdue-payment section to the admin dashboard (DEAD-05).

Output:
- paymentDeadline field in admin config Deadlines section
- Overdue payments section in admin dashboard
- Approval + payment deadline status on employee request detail page
- /api/config/public returns approvalDeadline and paymentDeadline CC-scoped
</objective>

<execution_context>
@/Users/yokosimon/.claude/get-shit-done/workflows/execute-plan.md
@/Users/yokosimon/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/03-per-cc-policies-deadlines/03-RESEARCH.md
@.planning/phases/03-per-cc-policies-deadlines/03-01-SUMMARY.md

<interfaces>
From src/app/(admin)/admin/page.tsx (addBusinessDays and overdue approvals pattern to replicate):
```typescript
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const day = result.getDay()
    if (day !== 0 && day !== 6) { added++ }
  }
  return result
}

// Existing: overdueSteps (PENDING approval steps past approvalDeadline)
// New: overduePayments (APPROVED requests past paymentDeadline from updatedAt)
const overdueSteps = pendingSteps.filter((step) => {
  const submittedAt = step.request.submittedAt ?? step.request.createdAt
  const deadline = addBusinessDays(submittedAt, deadlineBusinessDays)
  return deadline <= now
})
```

From src/app/(employee)/employee/requests/[id]/page.tsx (request shape):
```typescript
interface ApprovalStep {
  status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGE_REQUESTED"
  decidedAt: string | null
  approver: { name: string | null }
}
interface ReimbursementRequest {
  id: string
  status: RequestStatus  // "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" etc.
  updatedAt: string
  submittedAt: string | null
  approvalSteps: ApprovalStep[]
}
// Page already fetches request via fetch(`/api/requests/${id}`)
// Page shows approvalSteps list starting at line 759
```

From src/lib/submission-limits.ts (created in Plan 01 — use isOverduePayment if needed):
```typescript
export function isOverduePayment(
  approvedAt: Date,
  paymentDeadlineDays: number | null,
  now: Date
): boolean
```

From src/app/api/config/public/route.ts (current state — no CC scope):
```typescript
// Currently uses prisma.adminConfig.findMany with key filter — no orgId/ccId
// Returns: submissionDeadline, allowedCategories, maxAmountPerCategory, requireReceiptAbove
// Must add: approvalDeadline, paymentDeadline
// Must fix: use getConfig() with user's orgId + ccId
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: paymentDeadline admin config UI field + fix public config endpoint CC scope</name>
  <files>src/app/(admin)/admin/config/page.tsx, src/app/api/config/public/route.ts</files>
  <action>
    PART A — src/app/(admin)/admin/config/page.tsx:

    1. Add state variable near submissionDeadline and approvalDeadline:
       const [paymentDeadline, setPaymentDeadline] = useState(5)

    2. In the config load effect (where submissionDeadline/approvalDeadline are set), add:
       if (typeof config.paymentDeadline === "number") setPaymentDeadline(config.paymentDeadline)

    3. Extend handleSaveDeadlines to include paymentDeadline. The existing call:
         Promise.all([saveConfig("submissionDeadline", ...), saveConfig("approvalDeadline", ...)])
       becomes three entries with paymentDeadline as the third. Update ok1 && ok2 check to ok1 && ok2 && ok3.

    4. In the Deadlines section JSX (after the approvalDeadline input field), add:
       - Label "Payment Deadline" with helper text "Business days after approval for Finance Officer to pay"
       - input type="number" min="1" step="1" value={paymentDeadline}
         onChange={(e) => setPaymentDeadline(Number(e.target.value))}
       Match the visual style of the existing submissionDeadline / approvalDeadline inputs exactly.

    PART B — src/app/api/config/public/route.ts:

    The current implementation uses prisma.adminConfig.findMany with a key filter but no org/CC scope.
    Replace it entirely:

    1. Add imports: import { getConfig } from "@/lib/config"
       (prisma, auth, getSubmissionMonth already imported)

    2. Resolve calling user's org and CC:
       const user = await prisma.user.findUnique({
         where: { id: session.user.id },
         select: { costCenterId: true, organizationId: true },
       })
       const orgId = user?.organizationId ?? null
       const ccId = user?.costCenterId ?? null

    3. Replace the findMany block with six parallel getConfig calls:
       const [submissionDeadlineRaw, allowedCategoriesRaw, maxAmtPerCatRaw,
              requireReceiptRaw, approvalDeadlineRaw, paymentDeadlineRaw] =
         await Promise.all([
           getConfig(prisma, "submissionDeadline", orgId, ccId),
           getConfig(prisma, "allowedCategories", orgId, ccId),
           getConfig(prisma, "maxAmountPerCategory", orgId, ccId),
           getConfig(prisma, "requireReceiptAbove", orgId, ccId),
           getConfig(prisma, "approvalDeadline", orgId, ccId),
           getConfig(prisma, "paymentDeadline", orgId, ccId),
         ])

    4. Build result object with bare-number coercions (fix shape mismatch inherited from old code):
       const result = {
         submissionDeadline: typeof submissionDeadlineRaw === "number" ? submissionDeadlineRaw : null,
         allowedCategories: Array.isArray(allowedCategoriesRaw) ? allowedCategoriesRaw : null,
         maxAmountPerCategory: maxAmtPerCatRaw ?? null,
         requireReceiptAbove: typeof requireReceiptRaw === "number" ? requireReceiptRaw : null,
         approvalDeadline: typeof approvalDeadlineRaw === "number" ? approvalDeadlineRaw : null,
         paymentDeadline: typeof paymentDeadlineRaw === "number" ? paymentDeadlineRaw : null,
         currentSubmissionMonth: await getSubmissionMonth(),
       }
       return NextResponse.json(result)
  </action>
  <verify>
    <automated>cd "/Users/yokosimon/Reimbursement Apps/reimbursement-app/.claude/worktrees/dreamy-jones-22d72f" && npx tsc --noEmit 2>&1 | head -20</automated>
    Expected: zero TypeScript errors. grep "paymentDeadline" src/app/api/config/public/route.ts returns a match.
  </verify>
  <done>
    paymentDeadline state var, load, save, and input field present in config/page.tsx.
    public/route.ts uses getConfig() with user CC scope and returns approvalDeadline + paymentDeadline.
    npx tsc --noEmit exits 0.
  </done>
</task>

<task type="auto">
  <name>Task 2: Overdue payments section in admin dashboard (DEAD-05) + employee deadline status on request detail (DEAD-04)</name>
  <files>src/app/(admin)/admin/page.tsx, src/app/(employee)/employee/requests/[id]/page.tsx</files>
  <action>
    PART A — src/app/(admin)/admin/page.tsx (DEAD-05):

    The page already has an overdue approvals section. Add an overdue payments section using the same pattern.

    1. Read paymentDeadline config alongside the existing approvalDeadline config read. Add to the existing parallel fetch at the top of the component (where deadlineBusinessDays is loaded):
       const paymentDeadlineConfig = await getConfig(prisma, "paymentDeadline", orgId, null) as number | null
       const paymentDeadlineDays = typeof paymentDeadlineConfig === "number" ? paymentDeadlineConfig : null

       Note: admin/page.tsx is a Server Component — use direct Prisma + getConfig calls, not fetch. Look at how deadlineBusinessDays is currently loaded in the existing code and match that pattern.

    2. Query APPROVED requests for overdue payment detection:
       const approvedRequests = await prisma.reimbursementRequest.findMany({
         where: { status: "APPROVED" },
         select: {
           id: true,
           title: true,
           amount: true,
           currency: true,
           updatedAt: true,
           employee: { select: { name: true, email: true } },
           costCenter: { select: { name: true } },
         },
       })

    3. Filter to overdue (use updatedAt as proxy for approvedAt — it updates on status change):
       const now = new Date()
       const overduePayments = paymentDeadlineDays == null ? [] : approvedRequests.filter((req) => {
         const payByDate = addBusinessDays(req.updatedAt, paymentDeadlineDays)
         return payByDate <= now
       })

    4. Add an overdue payments stat card next to the existing overdue approvals card:
       Use the same Card + stat number pattern. Title: "Overdue Payments". Count: overduePayments.length.
       Highlight in amber/orange to distinguish from overdue approvals (which use red/destructive).

    5. Add an overdue payments list section below the overdue approvals section:
       Show up to 10 items. Each row: request title, employee name, cost center name, amount + currency,
       days overdue. Match the visual structure of the existing overdueSteps list.
       If paymentDeadlineDays is null, show a notice: "Configure a payment deadline to track overdue payments."
       If no overdue payments: "No overdue payments. All approved requests are within the payment deadline."

    PART B — src/app/(employee)/employee/requests/[id]/page.tsx (DEAD-04):

    The page already shows approvalSteps as a timeline. Add deadline status indicators above or below the steps.

    1. Add a useEffect to fetch deadline config from /api/config/public on component mount:
       useEffect(() => {
         fetch("/api/config/public")
           .then((r) => r.json())
           .then((data) => {
             setApprovalDeadlineDays(data.approvalDeadline ?? null)
             setPaymentDeadlineDays(data.paymentDeadline ?? null)
           })
           .catch(() => {})
       }, [])

       Add corresponding state vars: approvalDeadlineDays (number | null), paymentDeadlineDays (number | null).

    2. Compute deadline dates from request data:
       - Approval deadline: addBusinessDays(new Date(request.submittedAt ?? request.createdAt), approvalDeadlineDays)
         — only relevant when request.status === "SUBMITTED" (awaiting approval)
       - Payment deadline: addBusinessDays(new Date(request.updatedAt), paymentDeadlineDays)
         — only relevant when request.status === "APPROVED"

       Add a local addBusinessDays function (same implementation as admin/page.tsx):
       function addBusinessDays(date: Date, days: number): Date { ... }

    3. Render a deadline status banner in the approval steps section. Insert it before or after the approvalSteps list (around line 759 in existing code):

       When status === "SUBMITTED" and approvalDeadlineDays is set:
         Show: "Approval due by [date]" or "Approval overdue by [N] days" (in amber if upcoming, red if past)

       When status === "APPROVED" and paymentDeadlineDays is set:
         Show: "Payment due by [date]" or "Payment overdue by [N] days" (in amber if upcoming, red if past)

       Use simple inline text with an icon (Clock or AlertTriangle from lucide-react — already imported).
       Keep it compact — one line of text, not a full card.

    Format dates using the format() function from date-fns (already imported in the employee requests page).
  </action>
  <verify>
    <automated>cd "/Users/yokosimon/Reimbursement Apps/reimbursement-app/.claude/worktrees/dreamy-jones-22d72f" && npx tsc --noEmit 2>&1 | head -20 && npx vitest run 2>&1 | tail -5</automated>
    Expected: tsc exits 0, full vitest suite green.
  </verify>
  <done>
    Admin dashboard has an overdue payments section showing APPROVED requests past paymentDeadline business days from updatedAt.
    Employee request detail page shows approval deadline status when SUBMITTED and payment deadline status when APPROVED.
    All deadline config is CC-scoped in both admin and employee paths.
    npx tsc --noEmit and npx vitest run both exit 0.
  </done>
</task>

</tasks>

<verification>
Full test suite green: `npx vitest run`

paymentDeadline in config UI: `grep -c "paymentDeadline" src/app/(admin)/admin/config/page.tsx` returns 3+

Public endpoint CC-scoped: `grep -c "getConfig" src/app/api/config/public/route.ts` returns 3+

Overdue payments in admin: `grep -c "overduePayment" src/app/(admin)/admin/page.tsx` returns 2+

Employee deadline status: `grep -c "approvalDeadlineDays\|paymentDeadlineDays" "src/app/(employee)/employee/requests/[id]/page.tsx"` returns 2+
</verification>

<success_criteria>
1. Admin config Deadlines section has paymentDeadline field that saves per CC
2. Admin dashboard shows overdue payments count + list (APPROVED requests past paymentDeadline)
3. Employee request detail shows "Approval due by [date]" when SUBMITTED, "Payment due by [date]" when APPROVED
4. /api/config/public returns approvalDeadline and paymentDeadline fields, CC-scoped to calling user
5. npx tsc --noEmit exits 0 across both plan files
6. npx vitest run exits 0 (all tests pass including Plan 01 submission-limits tests)
</success_criteria>

<output>
After completion, create `.planning/phases/03-per-cc-policies-deadlines/03-02-SUMMARY.md` documenting:
- Files modified
- How overdue payment detection works (updatedAt proxy rationale)
- Where deadline status renders in employee UI
- Known limitation: limit enforcement amounts are in request currency, not normalized (pre-existing, documented)
</output>
