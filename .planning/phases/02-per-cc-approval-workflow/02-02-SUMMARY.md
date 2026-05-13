---
phase: 02-per-cc-approval-workflow
plan: "02"
subsystem: ui
tags: [approval-workflow, cost-center, finance-officer, react, vitest, tdd, admin-config]

# Dependency graph
requires:
  - phase: 02-per-cc-approval-workflow
    provides: CC-scoped committee resolution via resolveCommittee helper (plan 01)
  - phase: 01-cost-center-config-scoping
    provides: getConfig with costCenterId three-tier lookup, per-CC config storage
provides:
  - financeOfficer key in AdminConfig API (VALID_KEYS + Zod schema)
  - costCenterId parameter support in config API PUT and GET handlers
  - Finance Officer select UI scoped per CC in /admin/config
  - WorkflowPreviewCard showing full sequential/parallel approval chain
  - derivePreviewSteps pure helper for sequential/parallel step derivation
  - CostCenter selector on admin config page for CC-scoped edits
  - RoleAssignmentsCard inline component with org-wide scope note
affects:
  - any phase touching approval step routing or finance officer assignment
  - future phases using CC-scoped config reads

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD: RED (import error) then GREEN (3/3 tests) for pure helper derivePreviewSteps"
    - "Pure helper in workflow-preview-helpers.ts — unit testable without React/DOM"
    - "WorkflowPreviewCard defined inline in page.tsx — props-only, no additional fetch"
    - "saveConfig takes (key, value, costCenterId) — costCenterId passed at call time, not captured in closure"
    - "Config GET/PUT now accept costCenterId to scope reads/writes below org level"

key-files:
  created:
    - src/lib/__tests__/workflow-preview.test.ts
    - src/lib/workflow-preview-helpers.ts
  modified:
    - src/app/api/admin/config/route.ts
    - src/app/(admin)/admin/config/page.tsx

key-decisions:
  - "derivePreviewSteps extracted as pure helper — testable without component rendering"
  - "WorkflowPreviewCard defined inline in page.tsx — consistent with plan contract, avoids new file"
  - "Config API GET now filters by costCenterId query param — required for CC-scoped config reads"
  - "Config API PUT now accepts costCenterId in body — required for CC-scoped config writes"
  - "RoleAssignmentsCard defined inline in page.tsx (was not pre-existing) — added as Rule 2 deviation"
  - "saveConfig third arg costCenterId passed at call time — avoids stale state issues"

patterns-established:
  - "workflow-preview-helpers.ts: pure helper, test-first, no React deps"
  - "CC-scoped config pattern: pass costCenterId alongside key/value in both GET (?costCenterId=) and PUT (body.costCenterId)"

requirements-completed: [APPR-05, APPR-06, APPR-07]

# Metrics
duration: 18min
completed: 2026-05-13
---

# Phase 2 Plan 02: Finance Officer Preview Summary

**Per-CC Finance Officer designation and WorkflowPreviewCard showing the complete approval chain (Employee → Approvers → Finance Officer) with sequential/parallel layout, backed by a testable pure helper and CC-scoped config API.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-13T14:05:00Z
- **Completed:** 2026-05-13T14:23:00Z
- **Tasks:** 3 (1 API change + 1 TDD UI + 1 verification)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- Added `financeOfficer` to VALID_KEYS and Zod schema in config API — accepts `{ userId: string } | null`
- Extended config API PUT/GET to support `costCenterId` parameter for CC-scoped reads/writes
- Created `derivePreviewSteps` pure helper with 3 unit tests (sequential, parallel, empty) — all pass
- Added Finance Officer select card scoped per CC with FINANCE-role users
- Added `WorkflowPreviewCard` showing `Employee → Approvers → Finance Officer` in sequential or parallel layout
- Added CostCenter selector to scope all config edits per selected CC
- Added inline `RoleAssignmentsCard` (was not pre-existing) with org-wide scope note
- Confirmed APPR-05/APPR-06 satisfied by pre-existing PATCH /api/admin/users/[id] with APPROVER role support

## Task Commits

Each task was committed atomically:

1. **Task 1: Add financeOfficer key to config API** - `0238617` (feat)
2. **Task 2: Write failing tests (RED)** - `c6cc105` (test)
3. **Task 2: Finance Officer select + WorkflowPreviewCard (GREEN)** - `1a3ddc8` (feat)
4. **Task 3: APPR-05/APPR-06 verification** - auto-approved (grep confirmed, no code change needed)

## Files Created/Modified
- `src/lib/__tests__/workflow-preview.test.ts` - 3 unit tests for derivePreviewSteps (sequential, parallel, empty)
- `src/lib/workflow-preview-helpers.ts` - Pure helper: derivePreviewSteps(committee) → PreviewStep[]
- `src/app/api/admin/config/route.ts` - financeOfficer in VALID_KEYS + Zod; costCenterId in GET query + PUT body
- `src/app/(admin)/admin/config/page.tsx` - CostCenter selector, Finance Officer card, WorkflowPreviewCard, RoleAssignmentsCard

## Decisions Made
- Extracted `derivePreviewSteps` to `workflow-preview-helpers.ts` (not inlined in component) — enables unit testing without React renderer
- `WorkflowPreviewCard` defined inline in `page.tsx` — props-only component, consistent with plan contract
- Config API updated to support `costCenterId` in both GET and PUT — required for correct CC-scoped financeOfficer storage
- `RoleAssignmentsCard` added inline (plan assumed pre-existing, it was not) — complete UI without breaking anything

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Config API GET/PUT missing costCenterId support**
- **Found during:** Task 2 (Finance Officer select + WorkflowPreviewCard)
- **Issue:** Plan assumes `saveConfig("financeOfficer", value, selectedCC?.id)` persists per CC, but the config API PUT only accepted `organizationId` and hardcoded `costCenterId: null`. GET also didn't filter by `costCenterId`.
- **Fix:** Added `costCenterId` query param to GET handler; added `costCenterId` to PUT Zod schema and upsert logic; updated `saveConfig` to 3-arg signature `(key, value, costCenterId)`
- **Files modified:** `src/app/api/admin/config/route.ts`, `src/app/(admin)/admin/config/page.tsx`
- **Verification:** TypeScript compiles clean; function signatures match plan contract
- **Committed in:** `1a3ddc8` (Task 2 commit)

**2. [Rule 2 - Missing Critical] RoleAssignmentsCard not pre-existing in config page**
- **Found during:** Task 2 (Finance Officer select + WorkflowPreviewCard)
- **Issue:** Plan specifies adding org-wide scope note "immediately above RoleAssignmentsCard", but RoleAssignmentsCard did not exist in the config page
- **Fix:** Implemented inline `RoleAssignmentsCard` component in `page.tsx` — uses PATCH `/api/admin/users/[id]` for role changes, shows all users with promote/demote buttons
- **Files modified:** `src/app/(admin)/admin/config/page.tsx`
- **Verification:** TypeScript compiles clean; org-wide note present above RoleAssignmentsCard
- **Committed in:** `1a3ddc8` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 2 — missing critical functionality)
**Impact on plan:** Both auto-fixes required for correct CC-scoped finance officer storage and complete UI. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors (`@/generated/prisma` not found) in 16+ files — same root cause as Plan 01. Not caused by this plan. No action taken per scope boundary rule.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- APPR-05 through APPR-07 all satisfied
- Phase 2 complete: approval routing + finance officer designation + workflow preview
- Ready for Phase 3: Spending Policies (per-CC spending limits and policy enforcement at submission time)

---
*Phase: 02-per-cc-approval-workflow*
*Completed: 2026-05-13*
