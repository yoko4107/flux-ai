---
phase: 02-per-cc-approval-workflow
verified: 2026-05-13T15:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 2: Per-CC Approval Workflow Verification Report

**Phase Goal:** Approval committee (approvers, mode) is independently configurable per cost center.
**Verified:** 2026-05-13T15:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                 | Status     | Evidence                                                                                                          |
|----|---------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------------------|
| 1  | CC A committee config used when submitter is in CC A (not org-wide)                   | VERIFIED   | `route.ts` fetches `submitter.costCenterId` and passes it to `resolveCommittee`; `resolveCommittee` calls `getConfig` with the CC ID (three-tier lookup already implemented in Phase 1) |
| 2  | Empty approvers array creates zero ApprovalStep rows (not a crash)                    | VERIFIED   | `buildApprovalSteps("req-001", [])` returns `[]`; route wraps `createMany` in `if (stepData.length > 0)` guard   |
| 3  | Role promotion endpoint exists and accepts APPROVER role                               | VERIFIED   | `PATCH /api/admin/users/[id]` accepts `role: z.enum(["EMPLOYEE","APPROVER","FINANCE","ADMIN","SUPER_ADMIN"])` and performs `prisma.user.update`; RoleAssignmentsCard calls this endpoint |
| 4  | WorkflowPreviewCard exists and shows sequential/parallel layout + Finance Officer      | VERIFIED   | `WorkflowPreviewCard` defined in `page.tsx`; renders sequential steps with numbered labels, parallel steps with "(parallel)" badge, and a Finance Officer node at the end; uses `derivePreviewSteps` helper |
| 5  | Parallel mode notifies all approvers, not just the first                               | VERIFIED   | `selectNotifyTargets("parallel", steps)` returns all approver IDs; route iterates with `for (const approverId of notifyTargets)` and calls `sendNotification` per approver |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact                                           | Expected                                              | Status     | Details                                                                                    |
|----------------------------------------------------|-------------------------------------------------------|------------|--------------------------------------------------------------------------------------------|
| `src/lib/approval-routing-helpers.ts`              | Pure helpers: resolveCommittee, buildApprovalSteps, selectNotifyTargets | VERIFIED | All three functions present and substantive; 55 lines, no placeholders |
| `src/lib/__tests__/approval-routing.test.ts`       | 8 unit tests covering CC lookup, step creation, notify targets | VERIFIED | 8 tests across 3 describe blocks; covers parallel/sequential, empty, fallback, null-committee |
| `src/lib/workflow-preview-helpers.ts`              | Pure `derivePreviewSteps` helper                      | VERIFIED   | Exports `derivePreviewSteps` and `PreviewStep` interface; 10 lines, no stubs              |
| `src/lib/__tests__/workflow-preview.test.ts`       | 3 unit tests for derivePreviewSteps                   | VERIFIED   | 3 tests: sequential, parallel, empty — all directly testing the pure helper               |
| `src/app/api/requests/route.ts`                    | POST handler uses CC-scoped committee, builds steps, notifies correctly | VERIFIED | Fetches `submitter.costCenterId`; calls all three helpers; guards on `stepData.length > 0`; loops over `notifyTargets` |
| `src/app/api/admin/config/route.ts`                | `financeOfficer` in VALID_KEYS + Zod; `costCenterId` in GET/PUT | VERIFIED | `financeOfficer` in VALID_KEYS array with `z.object({ userId: z.string() }).nullable()` schema; GET accepts `costCenterId` query param; PUT accepts `costCenterId` in body |
| `src/app/(admin)/admin/config/page.tsx`            | CostCenter selector, Finance Officer card, WorkflowPreviewCard, RoleAssignmentsCard | VERIFIED | All four components present and wired; `saveConfig` passes `selectedCC?.id` as `costCenterId`; config reloads on CC change |
| `src/app/api/admin/users/[id]/route.ts`            | PATCH endpoint accepting APPROVER role                | VERIFIED   | Schema includes `APPROVER` in role enum; performs `prisma.user.update`; returns updated user |

---

### Key Link Verification

| From                          | To                                | Via                                         | Status  | Details                                                                                  |
|-------------------------------|-----------------------------------|---------------------------------------------|---------|------------------------------------------------------------------------------------------|
| `route.ts` (POST /api/requests) | `resolveCommittee`              | `import` + call with `submitterCCId`        | WIRED   | Import at line 9; called at line 168 with `submitter.costCenterId`                       |
| `resolveCommittee`            | `getConfig` (Phase 1)             | `import` + call with `costCenterId`         | WIRED   | `getConfig(prisma, "approvalCommittee", orgId, costCenterId)` — three-tier lookup        |
| `route.ts` (POST)             | `buildApprovalSteps`              | `import` + call with `rawApprovers`         | WIRED   | Called at line 176; result used in `prisma.approvalStep.createMany`                     |
| `route.ts` (POST)             | `selectNotifyTargets`             | `import` + call with `mode, stepData`       | WIRED   | Called at line 180; result iterated with `sendNotification` per approver                |
| `page.tsx`                    | `GET /api/admin/config?costCenterId=` | `loadData(ccId)` → `fetch` call         | WIRED   | `fetch(\`/api/admin/config\${ccId ? \`?costCenterId=${ccId}\` : ""}\`)` at line 405     |
| `page.tsx` (saveConfig)       | `PUT /api/admin/config`           | body includes `costCenterId`                | WIRED   | `JSON.stringify({ key, value, costCenterId })` at line 481                              |
| `WorkflowPreviewCard`         | `derivePreviewSteps`              | `import` + call with `committee`            | WIRED   | Import at line 11 of page.tsx; called at line 96 inside `WorkflowPreviewCard`           |
| `RoleAssignmentsCard`         | `PATCH /api/admin/users/[id]`     | `fetch` call in `changeRole`                | WIRED   | `fetch(\`/api/admin/users/${userId}\`, { method: "PATCH", ... })` at line 188           |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                          | Status    | Evidence                                                                               |
|-------------|-------------|------------------------------------------------------|-----------|----------------------------------------------------------------------------------------|
| APPR-01     | 02-01       | Admin can select approval mode (Sequential/Parallel) | SATISFIED | Mode radio buttons in config page; `committee.mode` persisted via `saveConfig`; `selectNotifyTargets` enforces mode at submission |
| APPR-02     | 02-01       | Admin can add Approver 1 to committee                | SATISFIED | `addApprover()` pushes to `committee.approvers[]`; `buildApprovalSteps` maps to `order: 0` |
| APPR-03     | 02-01       | Admin can add Approver 2 (optional)                  | SATISFIED | Same mechanism as APPR-02; second entry maps to `order: 1`; optional because empty array is safe |
| APPR-04     | 02-01       | Admin can remove approvers from committee            | SATISFIED | `removeApprover(id)` filters the array; `buildApprovalSteps([])` returns `[]` without crash; route guards on `stepData.length > 0` |
| APPR-05     | 02-02       | Admin can promote employee to Approver role          | SATISFIED | `RoleAssignmentsCard` select + button calls `changeRole(id, "APPROVER")`; PATCH endpoint accepts and persists `APPROVER` role |
| APPR-06     | 02-02       | Admin can demote approver back to employee           | SATISFIED | `RoleAssignmentsCard` X button calls `changeRole(id, "EMPLOYEE")`; same PATCH endpoint |
| APPR-07     | 02-02       | System displays approval workflow preview            | SATISFIED | `WorkflowPreviewCard` renders `Employee → Approvers (sequential/parallel) → Finance Officer`; uses `derivePreviewSteps` with 3 passing unit tests |

---

### Anti-Patterns Found

| File                                        | Pattern                       | Severity | Impact  | Notes                                                                 |
|---------------------------------------------|-------------------------------|----------|---------|-----------------------------------------------------------------------|
| `src/app/api/requests/route.ts` (line 73-84) | Legacy org-wide `adminConfig.findMany()` still used for validation checks | Info | None for approval routing | Spending limit / deadline checks use a flat non-CC-scoped config read; this is a future-phase concern, not a blocker for Phase 2 |

No TODO/FIXME/placeholder comments found in any Phase 2 files. No `return null` or empty `return {}` stubs. No console.log-only implementations.

---

### Human Verification Required

#### 1. CC selector triggers config reload

**Test:** On /admin/config, with two cost centers having different committees, switch between them using CostCenterSelector.
**Expected:** The Approval Committee card and WorkflowPreviewCard update to reflect the selected cost center's config without a page reload.
**Why human:** React state / useEffect re-fetch behavior cannot be verified by grep; requires live rendering.

#### 2. WorkflowPreviewCard visual layout — parallel vs sequential

**Test:** Configure 2 approvers in parallel mode; save; observe WorkflowPreviewCard.
**Expected:** Both approvers shown side-by-side with "(parallel)" badge in purple; Finance Officer shown at end.
**Why human:** Visual layout correctness requires browser rendering.

#### 3. Role promotion reflected in approver options immediately

**Test:** Promote an EMPLOYEE to APPROVER via RoleAssignmentsCard; observe the approver dropdown in the Approval Committee section.
**Expected:** The newly promoted user now appears in the "Select approver to add" dropdown.
**Why human:** Requires `onChanged` → `loadData` roundtrip to be visually confirmed in a live browser.

---

## Gaps Summary

None. All 5 must-haves verified. All 7 requirements (APPR-01 through APPR-07) satisfied with substantive, wired implementations. No blocking anti-patterns found.

The phase goal — "Approval committee (approvers, mode) is independently configurable per cost center" — is achieved end-to-end:

- Per-CC config storage: `adminConfig` rows keyed by `(key, organizationId, costCenterId)` via Phase 1's `getConfig` three-tier lookup.
- Per-CC committee resolution at submission: `route.ts` fetches `submitter.costCenterId` and passes it to `resolveCommittee`.
- Admin UI scoped to selected CC: all `saveConfig` calls pass `selectedCC?.id ?? null` as `costCenterId`; `loadData` re-fetches with `?costCenterId=` on CC change.
- WorkflowPreviewCard and derivePreviewSteps: pure helper tested in isolation; component wired and rendered.
- Role management: PATCH endpoint accepts APPROVER role; RoleAssignmentsCard wired to it.

---

_Verified: 2026-05-13T15:00:00Z_
_Verifier: Claude (gsd-verifier)_
