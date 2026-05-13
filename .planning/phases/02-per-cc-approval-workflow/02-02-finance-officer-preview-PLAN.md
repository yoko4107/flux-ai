---
phase: 02-per-cc-approval-workflow
plan: "02"
type: execute
wave: 2
depends_on: ["02-01"]
files_modified:
  - src/app/api/admin/config/route.ts
  - src/app/(admin)/admin/config/page.tsx
  - src/lib/__tests__/workflow-preview.test.ts
  - src/lib/workflow-preview-helpers.ts
autonomous: false
requirements: [APPR-05, APPR-06, APPR-07]
# APPR-05/APPR-06 pre-existing global role promotion — verified before Phase 2, no new implementation needed.

must_haves:
  truths:
    - "Admin can assign a different Finance Officer per cost center and the choice persists after switching CCs"
    - "Admin sees an approval flow preview card for the selected CC that updates when the committee or Finance Officer changes"
  artifacts:
    - path: "src/app/api/admin/config/route.ts"
      provides: "financeOfficer key accepted in VALID_KEYS and validated by Zod"
      contains: "financeOfficer"
    - path: "src/app/(admin)/admin/config/page.tsx"
      provides: "Finance Officer select UI + WorkflowPreviewCard component"
      contains: "WorkflowPreviewCard"
    - path: "src/lib/__tests__/workflow-preview.test.ts"
      provides: "Unit tests for WorkflowPreviewCard sequential vs parallel display logic"
      exports: []
    - path: "src/lib/workflow-preview-helpers.ts"
      provides: "Pure derivePreviewSteps helper used by WorkflowPreviewCard"
      exports: ["derivePreviewSteps"]
  key_links:
    - from: "src/app/(admin)/admin/config/page.tsx loadData"
      to: "configs.financeOfficer"
      via: "loaded alongside approvalCommittee in loadData response"
      pattern: "financeOfficer"
    - from: "WorkflowPreviewCard"
      to: "committee state + financeOfficer state + selectedCC"
      via: "props from parent — no additional fetch"
      pattern: "WorkflowPreviewCard.*committee.*financeOfficer"
    - from: "handleSaveFO"
      to: "PUT /api/admin/config"
      via: "saveConfig('financeOfficer', { userId: financeOfficerId }, selectedCC?.id ?? null)"
      pattern: "saveConfig.*financeOfficer.*selectedCC"
---

<objective>
Add per-CC Finance Officer designation and a read-only approval workflow preview to the admin config page.

Purpose: Admins need to see exactly how a reimbursement request will flow through approvers for the selected CC (APPR-07). Finance Officer must be expressible per CC in AdminConfig (needed by preview and future routing).

Output: `financeOfficer` key added to config API; Finance Officer select in config page; WorkflowPreviewCard showing the full approval chain for the selected CC.
</objective>

<execution_context>
@/Users/yokosimon/.claude/get-shit-done/workflows/execute-plan.md
@/Users/yokosimon/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/02-per-cc-approval-workflow/02-RESEARCH.md
@.planning/phases/02-per-cc-approval-workflow/02-01-SUMMARY.md

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from codebase. -->

From src/app/api/admin/config/route.ts (current state — add financeOfficer):
```typescript
const VALID_KEYS = [
  "approvalCommittee",
  "submissionDeadline",
  "approvalDeadline",
  "allowedCategories",
  "maxAmountPerCategory",
  "requireReceiptAbove",
  "notificationChannels",
  "resubmitBehavior",
  // ADD: "financeOfficer"
] as const

const valueSchemas: Record<string, z.ZodTypeAny> = {
  // existing keys...
  // ADD:
  // financeOfficer: z.object({ userId: z.string() }).nullable(),
}
```

From src/app/(admin)/admin/config/page.tsx (current state):
```typescript
interface UserOption { id: string; name: string | null; email: string | null; role: string }
interface ApprovalCommittee { mode: "sequential" | "parallel"; approvers: string[] }

// State already in parent:
const [committee, setCommittee] = useState<ApprovalCommittee>({ mode: "sequential", approvers: [] })
const [users, setUsers] = useState<UserOption[]>([])
const [selectedCC, setSelectedCC] = useState<CostCenter | null>(null)
// Add new state:
// const [financeOfficerId, setFinanceOfficerId] = useState<string | null>(null)
// const [savingFO, setSavingFO] = useState(false)

// loadData already fetches GET /api/admin/config?costCenterId=...
// Add to loadData: if (c.financeOfficer) setFinanceOfficerId((c.financeOfficer as { userId: string }).userId)

// saveConfig already handles PUT /api/admin/config with { key, value, costCenterId }
// Use: saveConfig("financeOfficer", { userId: financeOfficerId }, selectedCC?.id ?? null)

// RoleAssignmentsCard called at line 457:
// <RoleAssignmentsCard users={users} onChanged={() => loadData(selectedCC?.id ?? null)} />
// No changes needed to RoleAssignmentsCard component itself for this plan.
```

WorkflowPreviewCard props contract (new component — define inline in page.tsx):
```typescript
interface WorkflowPreviewCardProps {
  selectedCC: CostCenter | null
  committee: ApprovalCommittee
  users: UserOption[]
  financeOfficerId: string | null
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add financeOfficer key to config API</name>
  <files>src/app/api/admin/config/route.ts</files>
  <action>
    In src/app/api/admin/config/route.ts:

    1. Add "financeOfficer" to VALID_KEYS array (after "resubmitBehavior"):
    ```typescript
    const VALID_KEYS = [
      // ...existing keys...
      "resubmitBehavior",
      "financeOfficer",
    ] as const
    ```

    2. Add Zod schema for financeOfficer in valueSchemas:
    ```typescript
    financeOfficer: z.object({ userId: z.string() }).nullable(),
    ```

    No other changes to the route. The existing PUT and GET handlers already handle CC-scoped reads and writes for any valid key — adding to VALID_KEYS and valueSchemas is sufficient.

    TypeScript must compile without errors after this change.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -20 && echo "tsc OK"</automated>
  </verify>
  <done>"financeOfficer" is a valid PUT key accepted by the API. Zod validates { userId: string }. TypeScript compiles clean. Runtime acceptance verified manually via the UI flow in Task 2.</done>
</task>

<task type="tdd" tdd="true">
  <name>Task 2: Finance Officer select + WorkflowPreviewCard in config page</name>
  <files>src/app/(admin)/admin/config/page.tsx, src/lib/__tests__/workflow-preview.test.ts, src/lib/workflow-preview-helpers.ts</files>
  <behavior>
    - Test 1 (sequential): given committee { mode: "sequential", approvers: ["u1","u2"] }, derivePreviewSteps returns [{ id:"u1", parallel:false }, { id:"u2", parallel:false }]
    - Test 2 (parallel): given committee { mode: "parallel", approvers: ["u1","u2"] }, derivePreviewSteps returns [{ id:"u1", parallel:true }, { id:"u2", parallel:true }]
    - Test 3 (empty): given committee { mode: "sequential", approvers: [] }, derivePreviewSteps returns []
    - Tests run via: `npm test -- --run src/lib/__tests__/workflow-preview.test.ts`
    - Write tests first (RED), then implement, then confirm GREEN
  </behavior>
  <action>
    **Step 0 — TDD: Write tests first (RED):**
    Create src/lib/__tests__/workflow-preview.test.ts importing a pure helper `derivePreviewSteps` from `@/lib/workflow-preview-helpers`:
    ```typescript
    import { describe, it, expect } from "vitest"
    import { derivePreviewSteps } from "@/lib/workflow-preview-helpers"

    describe("derivePreviewSteps", () => {
      it("sequential: marks each step as non-parallel", () => {
        const steps = derivePreviewSteps({ mode: "sequential", approvers: ["u1", "u2"] })
        expect(steps).toEqual([{ id: "u1", parallel: false }, { id: "u2", parallel: false }])
      })
      it("parallel: marks each step as parallel", () => {
        const steps = derivePreviewSteps({ mode: "parallel", approvers: ["u1", "u2"] })
        expect(steps).toEqual([{ id: "u1", parallel: true }, { id: "u2", parallel: true }])
      })
      it("empty approvers: returns empty array", () => {
        const steps = derivePreviewSteps({ mode: "sequential", approvers: [] })
        expect(steps).toEqual([])
      })
    })
    ```
    Run `npm test -- --run src/lib/__tests__/workflow-preview.test.ts` — expect failure (import error = RED confirmed).

    **Step 1 — Create src/lib/workflow-preview-helpers.ts (GREEN):**
    ```typescript
    export interface PreviewStep { id: string; parallel: boolean }
    export function derivePreviewSteps(
      committee: { mode: string; approvers: string[] }
    ): PreviewStep[] {
      return committee.approvers.map((id) => ({ id, parallel: committee.mode === "parallel" }))
    }
    ```
    Run tests again — all three must pass (GREEN).

    **Step 2 — State + loadData wiring (in AdminConfigPage function body):**
    Add after the committee state:
    ```typescript
    const [financeOfficerId, setFinanceOfficerId] = useState<string | null>(null)
    const [savingFO, setSavingFO] = useState(false)
    ```
    In loadData, after the approvalCommittee block, add:
    ```typescript
    if (c.financeOfficer) {
      const fo = c.financeOfficer as { userId?: string }
      setFinanceOfficerId(fo.userId ?? null)
    } else {
      setFinanceOfficerId(null)
    }
    ```
    Add save handler after handleSaveResubmit:
    ```typescript
    async function handleSaveFO() {
      setSavingFO(true)
      const value = financeOfficerId ? { userId: financeOfficerId } : null
      const ok = await saveConfig("financeOfficer", value, selectedCC?.id ?? null)
      if (ok) toast.success("Finance Officer saved")
      else toast.error("Failed to save Finance Officer")
      setSavingFO(false)
    }
    ```

    **Step 3 — Finance Officer select card in JSX:**
    Insert a new SectionCard after the "Approval Committee" SectionCard and before "Role Assignments". Title: "Finance Officer for This Cost Center". Contains:
    - A label: "This officer handles payment for approved requests in [selectedCC?.name ?? 'this cost center']"
    - A &lt;select&gt; showing all users with role === "FINANCE" (from users state), plus an empty option "None assigned"
    - Value bound to financeOfficerId, onChange sets financeOfficerId
    - Save button using handleSaveFO / savingFO
    - Use SectionCard with metaKey="financeOfficer"

    If no FINANCE users exist, show: "No Finance Officers available. Promote an employee below."

    **Step 4 — WorkflowPreviewCard component (add before RoleAssignmentsCard definition at bottom of file):**
    Import `derivePreviewSteps` from `@/lib/workflow-preview-helpers`. Use it to derive steps in the component body, then render sequential steps as a numbered linear chain and parallel steps as a side-by-side block:
    ```typescript
    function WorkflowPreviewCard({
      selectedCC,
      committee,
      users,
      financeOfficerId,
    }: {
      selectedCC: CostCenter | null
      committee: ApprovalCommittee
      users: UserOption[]
      financeOfficerId: string | null
    }) {
      const fo = users.find((u) => u.id === financeOfficerId)
      const steps = derivePreviewSteps(committee)

      return (
        &lt;Card&gt;
          &lt;CardHeader&gt;
            &lt;CardTitle className="text-base"&gt;
              Approval Flow Preview
            &lt;/CardTitle&gt;
            &lt;p className="text-xs text-gray-500"&gt;
              How requests from &lt;span className="font-semibold"&gt;{selectedCC?.name ?? "this cost center"}&lt;/span&gt; will be routed
            &lt;/p&gt;
          &lt;/CardHeader&gt;
          &lt;CardContent&gt;
            {steps.length === 0 ? (
              &lt;p className="text-sm text-amber-600"&gt;No approvers configured — requests will not route.&lt;/p&gt;
            ) : (
              &lt;div className="space-y-2 text-sm"&gt;
                &lt;div className="flex items-center gap-2 flex-wrap"&gt;
                  &lt;span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium"&gt;Employee&lt;/span&gt;
                  &lt;span className="text-gray-400"&gt;→&lt;/span&gt;
                  {committee.mode === "sequential" ? (
                    steps.map((step, idx) => {
                      const u = users.find((u) => u.id === step.id)
                      return (
                        &lt;&gt;
                          &lt;span key={step.id} className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800"&gt;
                            {u?.name ?? u?.email ?? "Unknown"} (Step {idx + 1})
                          &lt;/span&gt;
                          {idx &lt; steps.length - 1 && &lt;span className="text-gray-400"&gt;→&lt;/span&gt;}
                        &lt;/&gt;
                      )
                    })
                  ) : (
                    &lt;div className="flex gap-2 flex-wrap items-center"&gt;
                      {steps.map((step) => {
                        const u = users.find((u) => u.id === step.id)
                        return (
                          &lt;span key={step.id} className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-800"&gt;
                            {u?.name ?? u?.email ?? "Unknown"} (parallel)
                          &lt;/span&gt;
                        )
                      })}
                    &lt;/div&gt;
                  )}
                  &lt;span className="text-gray-400"&gt;→&lt;/span&gt;
                  &lt;span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800"&gt;
                    {fo ? (fo.name ?? fo.email) : "Finance Officer (not set)"}
                  &lt;/span&gt;
                &lt;/div&gt;
                &lt;p className="text-xs text-gray-400 mt-2"&gt;
                  Mode: {committee.mode === "sequential" ? "Sequential — each approver acts in order" : "Parallel — all approvers notified simultaneously; all must approve"}
                &lt;/p&gt;
              &lt;/div&gt;
            )}
          &lt;/CardContent&gt;
        &lt;/Card&gt;
      )
    }
    ```

    Insert &lt;WorkflowPreviewCard&gt; in the JSX after the Finance Officer SectionCard (and before RoleAssignmentsCard):
    ```tsx
    &lt;WorkflowPreviewCard
      selectedCC={selectedCC}
      committee={committee}
      users={users}
      financeOfficerId={financeOfficerId}
    /&gt;
    ```

    **Step 5 — Org-wide scope note in RoleAssignmentsCard:**
    Find the RoleAssignmentsCard usage in the JSX (currently around line 457). Add a descriptive note immediately above it:
    ```tsx
    &lt;p className="text-xs text-gray-500 mb-2"&gt;
      Role promotions apply org-wide — not scoped to the selected cost center.
    &lt;/p&gt;
    &lt;RoleAssignmentsCard users={users} onChanged={() => loadData(selectedCC?.id ?? null)} /&gt;
    ```

    TypeScript must compile without errors. All JSX must use valid HTML/React patterns from the existing file (no new imports needed beyond `derivePreviewSteps` — Card, CardContent, CardHeader, CardTitle already imported).
  </action>
  <verify>
    <automated>npm test -- --run src/lib/__tests__/workflow-preview.test.ts && npx tsc --noEmit 2>&1 | head -30 && echo "TypeScript OK"</automated>
  </verify>
  <done>
    All three workflow-preview tests pass (GREEN). Config page compiles clean. Finance Officer select is visible below Approval Committee and persists correctly when switching CCs (state resets via loadData on CC change). WorkflowPreviewCard renders below Finance Officer section showing: "Approval Flow Preview — How requests from [CC Name] will be routed — Employee → Approver 1 → [Finance Officer]" (or parallel layout). RoleAssignmentsCard is preceded by the org-wide scope note.
  </done>
</task>

<task type="checkpoint" autonomous="false">
  <name>Task 3: Verify APPR-05 and APPR-06 pre-existing behavior</name>
  <files></files>
  <action>
    APPR-05 (promote to Approver) and APPR-06 (demote Approver) are pre-existing behavior via global role promotion in RoleAssignmentsCard — no new code needed.

    This task confirms that the PATCH endpoint for user role assignment already handles the APPROVER role, satisfying both requirements.

    Run the grep below to confirm the endpoint exists and references APPROVER role handling. If the grep returns results, these requirements are satisfied by existing code.
  </action>
  <verify>
    <automated>grep -r "APPROVER" src/app/api/admin/users --include="*.ts" | head -5</automated>
  </verify>
  <done>grep returns at least one match showing the PATCH endpoint references APPROVER role assignment, confirming APPR-05 and APPR-06 are satisfied by the pre-existing RoleAssignmentsCard + admin users API. No new code required.</done>
</task>

</tasks>

<verification>
After all tasks complete:
1. `npm test -- --run src/lib/__tests__/workflow-preview.test.ts` — all 3 tests pass
2. `npx tsc --noEmit` — zero TypeScript errors
3. `npx vitest run` — full suite passes (no regressions from Wave 1)
4. Grep: `grep -n "financeOfficer" src/app/api/admin/config/route.ts` — found in VALID_KEYS and valueSchemas
5. Grep: `grep -n "WorkflowPreviewCard\|financeOfficerId" src/app/(admin)/admin/config/page.tsx` — found
6. Grep: `grep -n "org-wide" src/app/(admin)/admin/config/page.tsx` — scope note present near RoleAssignmentsCard
7. Grep: `grep -r "APPROVER" src/app/api/admin/users --include="*.ts" | head -5` — APPR-05/APPR-06 pre-existing
8. Manual: Visit /admin/config, select a CC with approvers, see "Approval Flow Preview" card showing the configured committee and Finance Officer; switch CC and verify Finance Officer selection resets to the new CC's saved value
</verification>

<success_criteria>
- financeOfficer accepted as valid AdminConfig key; PUT saves it per CC; GET returns it in configs response
- Config page shows Finance Officer dropdown scoped to selected CC; saves correctly; choice persists after switching CCs
- WorkflowPreviewCard shows "Approval Flow Preview — How requests from [CC Name] will be routed" with sequential or parallel layout driven by derivePreviewSteps helper
- Sequential: Employee → Approver 1 → Approver 2 → Finance Officer (linear chain, numbered)
- Parallel: Employee → [Approver 1 + Approver 2 in parallel] → Finance Officer
- RoleAssignmentsCard preceded by "Role promotions apply org-wide — not scoped to the selected cost center" note
- APPR-05/APPR-06 confirmed satisfied by existing PATCH /api/admin/users/[id] endpoint handling APPROVER role
- TypeScript compiles clean; workflow-preview unit tests pass; no existing tests broken
</success_criteria>

<output>
After completion, create `.planning/phases/02-per-cc-approval-workflow/02-02-SUMMARY.md`
</output>
