# Phase 2: Per-CC Approval Workflow - Research

**Researched:** 2026-05-13
**Domain:** Approval routing, AdminConfig per-CC scoping, role management
**Confidence:** HIGH — all findings drawn from direct codebase inspection

---

## Summary

Phase 1 wired the `/api/admin/config` GET/PUT endpoints to accept `costCenterId` and the UI page now scopes all reads and writes to the selected CC. The approval committee UI (sequential/parallel toggle, add/remove/reorder approvers) already works and saves via `saveConfig("approvalCommittee", committee, selectedCC?.id ?? null)`.

However, a critical gap exists in **submission routing**: `POST /api/requests` calls `getConfig(prisma, "approvalCommittee", session.user.organizationId)` — it passes the org ID but **never passes the submitter's `costCenterId`**. This means it always reads the org-wide `approvalCommittee` row, ignoring any CC-specific committee stored in Phase 1. Fixing this is the central task of Phase 2.

Finance Officer assignment is currently global (`User.role = "FINANCE"`), not stored per CC in `AdminConfig`. The `RoleAssignmentsCard` in the config page calls `PATCH /api/admin/users/:id` with a global role change; the selected CC is not passed. This is an intentional v1 simplification (CostCenterRole table deferred to v2), but Phase 2 must store a per-CC `financeOfficer` key in `AdminConfig` so the finance officer shown in the approval workflow preview is CC-specific.

The approval workflow preview (APPR-07) does not exist yet — it must be built as a new read-only summary card inside the CC-scoped config page.

**Primary recommendation:** Fix `POST /api/requests` to pass `session.user.costCenterId` into `getConfig`, then extend the `RoleAssignmentsCard` to store `financeOfficer` in `AdminConfig` per CC, and add a workflow preview card to the config page.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| APPR-01 | Admin can select approval mode (Sequential or Parallel) | Already built in UI; reads/writes with costCenterId after Phase 1. Verify: mode stored as `committee.mode` field in `approvalCommittee` JSON. |
| APPR-02 | Admin can add Approver 1 to approval committee | Already built. Stored as `committee.approvers[0]` in `approvalCommittee` JSON value. Phase 1 scoped writes to CC. |
| APPR-03 | Admin can add Approver 2 to approval committee | Same as APPR-02; second array element. No index cap enforced — array is free-form. |
| APPR-04 | Admin can remove approvers from committee | Already built. `removeApprover()` mutates local state; Save persists per CC. |
| APPR-05 | Admin can promote employee to Approver role | Built in `RoleAssignmentsCard` via `PATCH /api/admin/users/:id`. **Gap:** promotion is global (`User.role`), not scoped to CC. v1 accepts global role — but the RoleAssignmentsCard must be made CC-aware so the dropdown only shows users in the selected CC. |
| APPR-06 | Admin can demote approver back to employee | Built in `RoleAssignmentsCard`. Same gap/approach as APPR-05. |
| APPR-07 | System displays approval workflow preview | **Does not exist.** Must be built as a read-only card on the config page showing the current CC's committee and routing order. |
</phase_requirements>

---

## Standard Stack

### Core (already in project — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma ORM | (existing) | `adminConfig.findMany` / `user.findUnique` | Already used throughout |
| Next.js App Router | (existing) | API routes + RSC | Project standard |
| Zod | (existing) | Input validation in PUT handler | Already used in config route |
| Vitest | (existing) | Unit tests | `vitest.config.ts` present, 9 tests in config-scoping suite |
| shadcn/ui + Tailwind | (existing) | Card, Button, Label, Badge | Used throughout config page |

### No New Dependencies

Phase 2 is purely additive configuration wiring and one new UI section. No new npm packages required.

**Installation:** None needed.

---

## Architecture Patterns

### Recommended File Touch Map

```
src/
├── app/
│   ├── api/
│   │   ├── admin/config/route.ts          — already complete (Phase 1)
│   │   └── requests/route.ts              — FIX: pass costCenterId to getConfig
│   └── (admin)/admin/config/page.tsx      — ADD: workflow preview card, CC-aware role display
├── lib/
│   ├── config.ts                          — getConfig() already supports costCenterId param
│   ├── config-scoping.ts                  — already complete (Phase 1)
│   └── approval-routing.ts               — REPLACE: filterCommitteeForRequester is superseded
└── lib/__tests__/
    └── approval-routing.test.ts           — NEW: unit tests for CC config lookup
```

### Pattern 1: CC-Scoped Config Read at Submission Time

**What:** `POST /api/requests` must resolve the submitter's CC ID, then call `getConfig` with all three params.

**Current (broken):**
```typescript
// src/app/api/requests/route.ts — line 161
const committeeValue = (await getConfig(prisma, "approvalCommittee", session.user.organizationId)) as ...
```

**Fixed:**
```typescript
// Resolve submitter's cost center
const submitter = await prisma.user.findUnique({
  where: { id: session.user.id },
  select: { costCenterId: true },
})
const submitterCCId = submitter?.costCenterId ?? null

// Three-tier lookup: CC-specific → org-wide → global
const committeeValue = (await getConfig(
  prisma,
  "approvalCommittee",
  session.user.organizationId,
  submitterCCId  // NEW: pass CC ID
)) as { mode?: string; approvers?: string[] } | null
```

**When to use:** Any time approval committee must be resolved for a specific reimbursement request.

**Note on `getConfig` signature:** `src/lib/config.ts` already supports `getConfig(prisma, key, orgId, costCenterId?)` with three-tier lookup (CC → org → global). No changes needed to `config.ts`.

### Pattern 2: Approval Steps Use `approvers` Array (Not `members`)

The existing `approvalCommittee` Zod schema in `route.ts` stores:
```typescript
{ mode: "sequential" | "parallel", approvers: string[] }
```

The legacy `approval-routing.ts` `filterCommitteeForRequester` expects:
```typescript
CommitteeMember = { userId: string; order: number }
```

**Gap:** The config page stores approvers as a flat `string[]` (user IDs). The submission route at line 165-168 reads `committeeValue?.members` (legacy `CommitteeMember[]` shape). These two shapes are incompatible.

**Resolution:** At submission time, convert the flat `approvers: string[]` to ordered steps:
```typescript
const rawApprovers = committeeValue?.approvers ?? []
// Each approver gets order = index (0-based)
const stepData = rawApprovers.map((userId, idx) => ({
  requestId: request.id,
  approverId: userId,
  order: idx,
}))
```

The old `filterCommitteeForRequester` function in `approval-routing.ts` is the wrong abstraction for Phase 2 — it filter-by-member-CC which was a workaround for org-wide committees. With per-CC config, the CC committee is already correct by definition. **The `filterCommitteeForRequester` call should be removed** and replaced with the direct CC config lookup.

### Pattern 3: Per-CC Finance Officer in AdminConfig

Finance Officer assignment (`User.role = "FINANCE"`) is global — this is intentional for v1 (no `CostCenterRole` table). However, the **approval workflow preview** (APPR-07) needs to know which Finance Officer handles a given CC's requests.

**Approach:** Store a new `AdminConfig` key `financeOfficer` with value `{ userId: string }` per CC. The `RoleAssignmentsCard` already saves per the selected CC — extend it to also save/read this key alongside role promotion.

Add `financeOfficer` to `VALID_KEYS` in the config route and its Zod schema:
```typescript
// In route.ts VALID_KEYS array:
"financeOfficer",

// In valueSchemas:
financeOfficer: z.object({ userId: z.string() }).nullable(),
```

### Pattern 4: Workflow Preview Card (APPR-07)

A new read-only card on the config page, rendered below the Approval Committee card, showing:

```
This applies to: [CC Name]
Approval Mode: Sequential

Step 1: Alice Smith (APPROVER)
Step 2: Bob Jones (APPROVER)
Finance Officer: Carol Lee (FINANCE)

→ Approved requests go to Carol Lee for payment.
```

**Data source:** Already loaded in `loadData()` — `committee` state has mode + approvers array, `users` state has user details, `selectedCC` has CC name. No new API calls needed.

### Pattern 5: CC-Aware Role Assignment Display

The `RoleAssignmentsCard` currently shows ALL users in the org with APPROVER/FINANCE roles. After Phase 2, it should filter to show users assigned to the selected CC (by `User.costCenterId`).

**Props change:** Pass `selectedCC` into `RoleAssignmentsCard` so it can filter:
```typescript
// In RoleAssignmentsCard:
const ccApprovers = approvers.filter(u => !selectedCCId || u.costCenterId === selectedCCId || !u.costCenterId)
```

`RoleAssignmentsCard` receives `users` from the parent already — no new API fetch needed. Just pass the `selectedCC` prop.

### Anti-Patterns to Avoid

- **Keeping `filterCommitteeForRequester` call:** The new per-CC config makes member-level CC filtering redundant and wrong. Remove it.
- **Storing Finance Officer only in `User.role`:** Cannot express per-CC Finance Officer without `AdminConfig` key. Build the key.
- **Reusing `members` shape:** The config page stores `approvers: string[]`; don't re-introduce `{ userId, order }` objects into the config value — convert at read time in the submission route.
- **Adding `financeOfficer` to `getAllConfigs`:** `getAllConfigs` intentionally excludes CC-specific rows. Use `getConfig(prisma, "financeOfficer", orgId, ccId)` at submission time.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Three-tier config lookup | Custom Prisma queries | `getConfig(prisma, key, orgId, costCenterId)` | Already handles CC → org → global fallback |
| CC config merge for API GET | Custom merge | `mergeConfigs(ccRows, orgRows)` | O(n+m), last-write-wins, tested |
| CC ownership validation | Manual `findFirst` check | `validateCCOwnership(prisma, ccId, orgId)` | Returns sentinel for null, tested |
| Approval step creation from flat array | Complex ordering logic | Simple `array.map((id, idx) => ({...id, order: idx}))` | The ApprovalStep table is the source of truth |

---

## Common Pitfalls

### Pitfall 1: `getConfig` Not Receiving costCenterId

**What goes wrong:** Submission creates approval steps from the org-wide `approvalCommittee`, ignoring CC-specific config. CC A submits → gets CC B's approvers.

**Why it happens:** `POST /api/requests` line 161 calls `getConfig(prisma, "approvalCommittee", session.user.organizationId)` — two-arg form, no CC ID.

**How to avoid:** Add `submitter.costCenterId` as a fourth argument. The submitter's `costCenterId` must be fetched from the DB because `session.user` does not carry it.

**Warning signs:** Test: submit from a user with CC-specific committee → verify `ApprovalStep` rows reference CC committee members, not org-wide members.

### Pitfall 2: `members` vs `approvers` Shape Mismatch

**What goes wrong:** Submission route reads `committeeValue?.members` (old `CommitteeMember[]` shape). Config page stores `committee.approvers` (flat `string[]`). Result: `members` is always `undefined`, zero approval steps created.

**Why it happens:** The `approvalCommittee` Zod schema was updated to use `approvers: string[]` in the UI but the submission code still references the legacy `.members` shape.

**How to avoid:** In the submission route, read `committeeValue?.approvers ?? []`. Remove the old `filterCommitteeForRequester` logic.

**Warning signs:** Submit a request → check `ApprovalStep` count in DB is 0 despite committee being configured.

### Pitfall 3: `resubmit/route.ts` Also Reads Config Without CC

**What goes wrong:** When an employee resubmits after a change request, `resubmit/route.ts` calls `getAllConfigs(prisma)` without CC scoping for validation. Policy checks (max amounts, deadlines) run against org-wide config even if CC-specific overrides exist.

**Why it happens:** `getAllConfigs` intentionally excludes CC-specific rows (per its docstring). The resubmit route was written before Phase 1.

**How to avoid:** This is a Phase 3 concern (policy enforcement), but the pattern to follow is clear: fetch submitter's CC ID, use `getConfig` per-key with CC ID. Flag this for Phase 3 backlog; do not fix in Phase 2 (out of scope).

### Pitfall 4: `RoleAssignmentsCard` Receives No CC Context

**What goes wrong:** Admin selects CC A, promotes Employee X to APPROVER — but the card shows ALL approvers org-wide, making it appear CC A already has unrelated approvers. Confusing UX.

**Why it happens:** `RoleAssignmentsCard` is a standalone component that only receives `users` and `onChanged`. `selectedCC` is in the parent but not passed down.

**How to avoid:** Add `selectedCC: CostCenter | null` prop to `RoleAssignmentsCard`. Filter displayed approvers/finance to `user.costCenterId === selectedCC?.id || !user.costCenterId`.

### Pitfall 5: Parallel Mode Not Enforced in Approval Step Creation

**What goes wrong:** Sequential vs. parallel mode is stored in config but the step creation logic in `POST /api/requests` always treats steps as sequential (next approver notified only when previous approves). In parallel mode, ALL approvers should be notified simultaneously, and any one approval does not advance the chain.

**Why it happens:** The `approve/route.ts` logic routes to the next pending step by `order` — this is sequential behavior. Parallel mode requires all steps to be PENDING at once and any step approval checked against all-approved gate.

**How to avoid:** For Phase 2, the simplest correct implementation is: in parallel mode, all `ApprovalStep` rows start as PENDING (which they do). The `approve/route.ts` checks `allApproved = allSteps.every(s => s.status === "APPROVED")` — this already works for parallel (approve any, check if all done). The only broken behavior in parallel mode is the "notify next approver" chain — in parallel, notify ALL pending approvers on submission, not one by one. Fix: in submission, if `mode === "parallel"`, send notification to all approvers at once.

---

## Code Examples

### How `getConfig` Already Works (No Changes Needed)

```typescript
// Source: src/lib/config.ts
export async function getConfig(
  prisma: PrismaClient,
  key: string,
  orgId?: string | null,
  costCenterId?: string | null  // <-- already supported
) {
  if (orgId && costCenterId) {
    const cc = await prisma.adminConfig.findFirst({
      where: { key, organizationId: orgId, costCenterId },
    })
    if (cc) return cc.value  // CC-specific wins
  }
  if (orgId) {
    const scoped = await prisma.adminConfig.findFirst({
      where: { key, organizationId: orgId, costCenterId: null },
    })
    if (scoped) return scoped.value  // org-wide fallback
  }
  const global = await prisma.adminConfig.findFirst({
    where: { key, organizationId: null, costCenterId: null },
  })
  return global?.value ?? null  // global fallback
}
```

### Correct Submission-Time Committee Resolution

```typescript
// Source: derived from src/app/api/requests/route.ts lines 160-193 + fix
const submitter = await prisma.user.findUnique({
  where: { id: session.user.id },
  select: { costCenterId: true },
})
const submitterCCId = submitter?.costCenterId ?? null

const committeeValue = (await getConfig(
  prisma,
  "approvalCommittee",
  session.user.organizationId,
  submitterCCId
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
  
  // Notify based on mode
  if (mode === "sequential") {
    // Notify only first approver
    await sendNotification({ userId: stepData[0].approverId, ... })
  } else {
    // Notify all approvers in parallel
    for (const step of stepData) {
      await sendNotification({ userId: step.approverId, ... })
    }
  }
}
```

### Workflow Preview Card (APPR-07) Data Shape

```typescript
// All data already in parent state — no new fetch needed
// committee.mode: "sequential" | "parallel"
// committee.approvers: string[]  (user IDs)
// users: UserOption[]            (all org users with roles)
// selectedCC: CostCenter | null
// financeOfficer stored as AdminConfig key "financeOfficer" = { userId: string }
```

---

## Key Findings Per Research Focus

### Focus 1: Does approval committee work per-CC after Phase 1?

**Finding:** The admin config UI correctly reads and writes `approvalCommittee` per CC (Phase 1 complete). The gap is on the **submission side** — `POST /api/requests` does not pass `costCenterId` to `getConfig`, so CC-specific committees are never used at routing time.

**Confidence:** HIGH — direct code inspection of `src/app/api/requests/route.ts` line 161.

### Focus 2: How does approval routing currently work?

**Finding:** On `SUBMITTED` status, `POST /api/requests` calls `getConfig(prisma, "approvalCommittee", session.user.organizationId)` (no CC ID), converts `committeeValue.members` (legacy shape) to `ApprovalStep` rows, and creates them. The `filterCommitteeForRequester` call on line 168 was a workaround to filter an org-wide committee by member cost center — this is the wrong approach for per-CC config.

**Files:** `src/app/api/requests/route.ts` lines 160-193, `src/lib/approval-routing.ts`.

**Confidence:** HIGH — direct code inspection.

### Focus 3: How are Finance Officers assigned?

**Finding:** Finance Officers are assigned via `PATCH /api/admin/users/:id` with `{ role: "FINANCE" }`. This sets `User.role` globally — not per CC, and not stored in `AdminConfig`. The `RoleAssignmentsCard` does not pass `costCenterId` to this endpoint.

**Gap for Phase 2:** Store a `financeOfficer: { userId: string }` key in `AdminConfig` per CC (using the existing `saveConfig` pattern). This does not replace the global role promotion — it's a separate "designated Finance Officer for this CC's workflow" config entry used by the preview (APPR-07).

**Confidence:** HIGH — direct code inspection of `page.tsx` lines 645-793 and `api/admin/users/[id]`.

### Focus 4: Submitter's cost center relationship

**Finding:** `User.costCenterId` is a direct FK on the User model (`prisma/schema.prisma` line 257). `ReimbursementRequest` does not have its own `costCenterId` field — the CC is derived from `request.employee.costCenterId` at query time. `session.user` does not include `costCenterId` in the session token — it must be fetched via `prisma.user.findUnique`.

**Confidence:** HIGH — schema and session type inspection.

### Focus 5: APPR-05/APPR-06 role promotion conflict with per-CC intent

**Finding:** `User.role` is global. Promoting an employee to APPROVER makes them an approver for the entire org (they appear in the `approverOptions` dropdown everywhere). The `RoleAssignmentsCard` is CC-scoped in terms of display (after Phase 2 fix) but the promotion itself is still global.

**Risk level for Phase 2:** LOW — acceptable for v1. The ROADMAP explicitly defers per-CC role to Phase 5 (`CostCenterRole` table). The approval committee config (`approvalCommittee.approvers[]`) is the true per-CC gate — only users explicitly added to a CC's committee will receive approval steps for that CC's requests, regardless of their global role.

**Mitigation:** Add a UI note to the Role Assignments card: "Role assignments are org-wide. Use the Approval Committee section above to configure which approvers review requests for this cost center."

**Confidence:** HIGH.

### Focus 6: Workflow preview (APPR-07) — new UI or label addition?

**Finding:** The approval workflow preview does not exist at all. It must be built as a new card. The data (committee members, mode, Finance Officer) is already in-memory on the config page — no new API calls are needed. The only new data point is `financeOfficer` (stored in AdminConfig), which must be loaded in `loadData()` alongside the committee.

**Confidence:** HIGH.

---

## State of the Art

| Old Approach | Current Approach | Changed In | Impact |
|--------------|------------------|------------|--------|
| `filterCommitteeForRequester` (filter org-wide committee by member CC) | Direct per-CC `getConfig` lookup | Phase 2 (this phase) | Cleaner, no DB query for member CCs |
| Org-wide `approvalCommittee` (no costCenterId) | CC-specific `AdminConfig` row (Phase 1) | Phase 1 complete | Routing must be updated to use it |
| `members: CommitteeMember[]` shape | `approvers: string[]` shape | Config page rewrite (existing) | Submission route must be updated to read `approvers` |

**Deprecated after Phase 2:**
- `filterCommitteeForRequester` in `src/lib/approval-routing.ts` — remove call from submission route (can keep the function file for reference or delete it)
- Reading `committeeValue?.members` in submission route — replace with `committeeValue?.approvers`

---

## Open Questions

1. **Parallel mode notification behavior**
   - What we know: `approve/route.ts` all-approved check works for parallel. But submission only notifies stepData[0] currently.
   - What's unclear: Is the plan to notify all approvers at once in parallel mode, or just the first and let them "pull" from a queue?
   - Recommendation: Notify all at submission in parallel mode (simple, consistent with UI expectation). Implement in Phase 2.

2. **Resubmit route policy validation uses `getAllConfigs` without CC**
   - What we know: This reads org-wide config only, ignoring CC-specific overrides.
   - What's unclear: Scope — is this Phase 2 or Phase 3?
   - Recommendation: Phase 3 (policy enforcement). Flag in plan as known tech debt.

3. **Finance Officer card — save to AdminConfig or not?**
   - What we know: The RoleAssignmentsCard promotes users globally via `User.role`. Separate from which FO handles a CC's payments.
   - Recommendation: Add a dedicated "Finance Officer for this CC" select in the workflow preview/config that writes `financeOfficer: { userId }` to AdminConfig per CC. Keep global role promotion separate.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run src/lib/__tests__/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| APPR-01 | Sequential/parallel mode stored in CC-specific AdminConfig | unit | `npx vitest run src/lib/__tests__/config-scoping.test.ts` | Yes (existing) |
| APPR-02 | Approver added to CC committee, saved with costCenterId | unit | `npx vitest run src/lib/__tests__/approval-routing.test.ts` | No — Wave 0 |
| APPR-03 | Second approver stored and returned correctly | unit | `npx vitest run src/lib/__tests__/approval-routing.test.ts` | No — Wave 0 |
| APPR-04 | Approver removal persists correctly | unit | `npx vitest run src/lib/__tests__/approval-routing.test.ts` | No — Wave 0 |
| APPR-05 | Role promotion changes User.role globally | manual-only | manual: promote employee, verify role in DB | — |
| APPR-06 | Role demotion changes User.role globally | manual-only | manual: demote approver, verify role in DB | — |
| APPR-07 | Workflow preview renders correct members and mode | unit | `npx vitest run src/lib/__tests__/approval-routing.test.ts` | No — Wave 0 |
| ENFC-01 | Submission routing reads CC-specific committee | unit | `npx vitest run src/lib/__tests__/approval-routing.test.ts` | No — Wave 0 |

### Wave 0 Gaps

- [ ] `src/lib/__tests__/approval-routing.test.ts` — covers APPR-02, APPR-03, APPR-04, APPR-07, ENFC-01
  - Test: `getConfig` with CC ID returns CC committee over org-wide committee (mock Prisma)
  - Test: flat `approvers[]` → `ApprovalStep[]` conversion (order assignment)
  - Test: parallel mode → all approvers notified (mock `sendNotification`)
  - Test: sequential mode → only first approver notified at submission
  - Test: no CC committee → falls back to org-wide committee

*(Framework and existing config-scoping tests are already working.)*

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — `src/app/api/requests/route.ts` (submission flow)
- Direct codebase inspection — `src/lib/approval-routing.ts` (filterCommitteeForRequester)
- Direct codebase inspection — `src/lib/config.ts` (getConfig three-tier lookup)
- Direct codebase inspection — `src/lib/finance-scope.ts` (getCostCenterScope)
- Direct codebase inspection — `src/app/(admin)/admin/config/page.tsx` (UI state, save handlers)
- Direct codebase inspection — `prisma/schema.prisma` (User.costCenterId, ApprovalStep model)
- Phase 1 SUMMARY files — confirmed what was built and what patterns were established

### Secondary (MEDIUM confidence)
- None required — all findings verified against source code

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all libraries already in project
- Architecture: HIGH — directly derived from reading current code, not speculation
- Pitfalls: HIGH — bugs identified by reading actual code paths, not hypothetical

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (stable codebase; re-verify if major refactors land)
