---
phase: 02-per-cc-approval-workflow
plan: "01"
type: tdd
wave: 1
depends_on: []
files_modified:
  - src/lib/__tests__/approval-routing.test.ts
  - src/app/api/requests/route.ts
autonomous: true
requirements: [APPR-02, APPR-03, APPR-04, ENFC-01]
# APPR-01 pre-satisfied in Phase 1 — mode selection UI already per-CC via costCenterId scoping.
# No new implementation needed for APPR-01 in this phase.

must_haves:
  truths:
    - "Submitting a request from a CC-member employee uses that CC's approvalCommittee, not the org-wide one"
    - "Approval steps are created from the flat approvers[] array (not the legacy members[] shape)"
    - "In parallel mode, all approvers receive notifications simultaneously on submission"
    - "In sequential mode, only the first approver is notified on submission"
    - "When no CC-specific committee exists, the org-wide committee is used as fallback"
  artifacts:
    - path: "src/lib/__tests__/approval-routing.test.ts"
      provides: "Unit tests for CC-scoped committee lookup and step creation"
      exports: []
    - path: "src/app/api/requests/route.ts"
      provides: "POST /api/requests — fixed approval step creation"
      contains: "submitter.costCenterId"
  key_links:
    - from: "src/app/api/requests/route.ts"
      to: "src/lib/config.ts getConfig"
      via: "getConfig(prisma, 'approvalCommittee', orgId, submitterCCId)"
      pattern: "getConfig.*approvalCommittee.*submitterCCId"
    - from: "src/app/api/requests/route.ts"
      to: "prisma.approvalStep.createMany"
      via: "committeeValue?.approvers (not .members)"
      pattern: "committeeValue\\??\\.approvers"
---

<objective>
Fix two critical bugs in POST /api/requests that silently break approval routing:
1. getConfig is called without costCenterId — CC-specific committees are never used
2. Step creation reads committeeValue?.members (legacy shape) — always undefined, so zero approval steps are created
3. Parallel mode notifies only first approver — all approvers must be notified simultaneously

Purpose: Reimbursement requests submitted by CC-member employees must route to that CC's configured approvers, not the org-wide default.

Output: Failing tests (RED), then fixed route (GREEN). Approval steps are created from the correct per-CC committee using the current approvers[] shape.
</objective>

<execution_context>
@/Users/yokosimon/.claude/get-shit-done/workflows/execute-plan.md
@/Users/yokosimon/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/02-per-cc-approval-workflow/02-RESEARCH.md

<interfaces>
<!-- Key types and contracts the executor needs. -->

From src/lib/config.ts (already supports costCenterId — no changes needed):
```typescript
export async function getConfig(
  prisma: PrismaClient,
  key: string,
  orgId?: string | null,
  costCenterId?: string | null  // <-- ALREADY SUPPORTED; just not passed at call site
): Promise<unknown>
// Three-tier lookup: CC-specific → org-wide → global
```

From src/app/api/requests/route.ts (BROKEN — lines 160-193):
```typescript
// BUG 1: missing 4th arg (submitterCCId)
const committeeValue = (await getConfig(prisma, "approvalCommittee", session.user.organizationId)) as {
  mode?: string
  members?: Array<{ userId: string; order: number }>  // BUG 2: UI stores approvers[], not members[]
} | null
const rawMembers = committeeValue?.members ?? []  // always [] — shape mismatch
const { members } = await filterCommitteeForRequester(session.user.id, rawMembers)
// ^ filterCommitteeForRequester is a workaround that's no longer needed with per-CC config
```

Current AdminConfig value shape (stored by config page):
```typescript
{ mode: "sequential" | "parallel", approvers: string[] }
// NOT: { mode, members: { userId, order }[] }
```

Notification pattern (existing in route, calls sendNotification or equivalent):
```typescript
// Current: notifies stepData[0] only
// Fix: in parallel mode, notify ALL stepData items
```

From src/lib/approval-routing.ts (DEPRECATED call — remove from route):
```typescript
export async function filterCommitteeForRequester(userId: string, members: CommitteeMember[]): Promise<{ members: CommitteeMember[] }>
// This was a workaround for org-wide committees. Remove the call.
```
</interfaces>
</context>

<tasks>

<task type="tdd">
  <name>Task 1: Write failing tests for CC-scoped approval routing</name>
  <files>src/lib/__tests__/approval-routing.test.ts</files>
  <behavior>
    - Test 1 (ENFC-01): getConfig called with CC ID returns CC-specific committee over org-wide — mock Prisma to return different committees for CC vs org, assert CC committee is used
    - Test 2 (APPR-02/APPR-03): flat approvers[] → ApprovalStep[] conversion maps userId at index 0→order 0, index 1→order 1
    - Test 3 (APPR-04): empty approvers[] → zero ApprovalStep rows created
    - Test 4 (ENFC-01): no CC committee → falls back to org-wide committee (mock: CC findFirst returns null, org findFirst returns org committee)
    - Test 5 (ENFC-01 parallel): parallel mode → sendNotification called N times (once per approver); sequential → called exactly once (first approver only)
    - Tests MUST fail before implementation (RED phase confirmed by running `npx vitest run src/lib/__tests__/approval-routing.test.ts`)
    - Use vi.fn() mocks for Prisma and sendNotification; do not require DB connection
  </behavior>
  <action>
    Create src/lib/__tests__/approval-routing.test.ts with Vitest unit tests covering the five behaviors above. Import and test pure helper functions extracted from the route logic (see Task 2 — Task 1 defines the contracts, Task 2 implements them).

    Structure: define helper function signatures that Task 2 will implement in a new file src/lib/approval-routing-helpers.ts:
    - resolveCommittee(prisma, orgId, costCenterId): Promise&lt;{ mode: string; approvers: string[] } | null&gt;
    - buildApprovalSteps(requestId: string, approvers: string[]): { requestId: string; approverId: string; order: number }[]
    - selectNotifyTargets(mode: string, steps: { approverId: string }[]): string[]

    Import these from '../approval-routing-helpers' (file will not exist yet — tests fail with import error, confirming RED state).

    Run: `npx vitest run src/lib/__tests__/approval-routing.test.ts` — expect failure (import error or test failure).
  </action>
  <verify>
    <automated>npx vitest run src/lib/__tests__/approval-routing.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>Test file exists with 5+ tests, all failing (RED confirmed). Behaviors match the interface contracts defined above.</done>
</task>

<task type="tdd">
  <name>Task 2: Implement helpers and fix POST /api/requests (GREEN)</name>
  <files>src/lib/approval-routing-helpers.ts, src/app/api/requests/route.ts</files>
  <behavior>
    - resolveCommittee: calls getConfig(prisma, "approvalCommittee", orgId, costCenterId) — CC wins, falls back to org
    - buildApprovalSteps: maps approvers[idx] → { requestId, approverId: approvers[idx], order: idx }
    - selectNotifyTargets: if mode === "parallel" return all approverId values; else return [steps[0].approverId]
    - POST /api/requests: fetches submitter.costCenterId from DB, calls resolveCommittee, calls buildApprovalSteps, calls prisma.approvalStep.createMany, notifies using selectNotifyTargets
    - Remove filterCommitteeForRequester call entirely from route
    - Remove legacy committeeValue?.members read — use committeeValue?.approvers
  </behavior>
  <action>
    Step 1 — Create src/lib/approval-routing-helpers.ts:
    Export three pure/async functions matching the contracts from Task 1:
    - resolveCommittee(prisma, orgId, costCenterId): calls getConfig from '@/lib/config' with all four args; casts result as { mode?: string; approvers?: string[] } | null; returns null if unset
    - buildApprovalSteps(requestId, approvers): array.map with (userId, idx) → { requestId, approverId: userId, order: idx }
    - selectNotifyTargets(mode, steps): parallel → all; sequential → first only

    Step 2 — Fix src/app/api/requests/route.ts in the SUBMITTED block (lines ~160-193):
    Replace the broken block with:
    ```typescript
    const submitter = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { costCenterId: true },
    })
    const submitterCCId = submitter?.costCenterId ?? null

    const committeeValue = (await getConfig(
      prisma,
      "approvalCommittee",
      session.user.organizationId,
      submitterCCId,
    )) as { mode?: string; approvers?: string[] } | null

    const rawApprovers = committeeValue?.approvers ?? []
    const mode = committeeValue?.mode ?? "sequential"
    const stepData = rawApprovers.map((userId, idx) => ({
      requestId: request.id,
      approverId: userId,
      order: idx,
    }))

    if (stepData.length > 0) {
      await prisma.approvalStep.createMany({ data: stepData })
      const notifyTargets = mode === "parallel"
        ? stepData.map((s) => s.approverId)
        : [stepData[0].approverId]
      // replace with actual notification call pattern used in this file
      for (const approverId of notifyTargets) {
        // send notification per existing pattern
      }
    }
    ```
    Remove the import of filterCommitteeForRequester if it becomes unused.
    TypeScript must compile without errors: `npx tsc --noEmit`.
    Tests must pass: `npx vitest run src/lib/__tests__/approval-routing.test.ts`.
  </action>
  <verify>
    <automated>npx vitest run src/lib/__tests__/approval-routing.test.ts && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>All 5+ tests pass (GREEN). TypeScript compiles cleanly. src/app/api/requests/route.ts reads approvers[] not members[], passes costCenterId to getConfig, notifies all approvers in parallel mode.</done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `npx vitest run src/lib/__tests__/approval-routing.test.ts` — all tests pass
2. `npx tsc --noEmit` — zero TypeScript errors
3. `npx vitest run` — full suite still green (no regressions)
4. Grep confirms: `grep -n "\.members" src/app/api/requests/route.ts` — no matches (legacy shape removed)
5. Grep confirms: `grep -n "submitterCCId\|costCenterId" src/app/api/requests/route.ts` — present
</verification>

<success_criteria>
- CC-specific approvalCommittee used when submitter belongs to a CC with a configured committee
- Org-wide committee used as fallback when no CC-specific committee exists
- ApprovalStep rows are created with order=0,1,2... from the approvers[] array
- Parallel mode: all approvers notified; sequential mode: only first approver notified
- No TypeScript errors; full test suite passes
</success_criteria>

<output>
After completion, create `.planning/phases/02-per-cc-approval-workflow/02-01-SUMMARY.md`
</output>
