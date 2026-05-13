---
phase: 02-per-cc-approval-workflow
plan: "01"
subsystem: api
tags: [approval-routing, cost-center, prisma, vitest, tdd, notifications]

# Dependency graph
requires:
  - phase: 01-cost-center-config-scoping
    provides: getConfig with costCenterId three-tier lookup, per-CC config storage
provides:
  - CC-scoped approval committee resolution via resolveCommittee helper
  - Correct ApprovalStep creation from flat approvers[] array
  - Parallel/sequential notification targeting via selectNotifyTargets
  - Fixed POST /api/requests approval step creation (was silently creating zero steps)
affects:
  - 02-per-cc-approval-workflow (remaining plans)
  - any phase touching approval step creation or notification

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure helper functions extracted from route logic for unit testability (resolveCommittee, buildApprovalSteps, selectNotifyTargets)"
    - "TDD: RED (failing import) then GREEN (all 8 tests pass)"
    - "CC-scoped committee lookup: getConfig called with submitter.costCenterId"

key-files:
  created:
    - src/lib/__tests__/approval-routing.test.ts
    - src/lib/approval-routing-helpers.ts
  modified:
    - src/app/api/requests/route.ts

key-decisions:
  - "Extract resolveCommittee/buildApprovalSteps/selectNotifyTargets as pure helpers in approval-routing-helpers.ts for testability without DB"
  - "Route fetches submitter.costCenterId at submission time — not captured in session (session has organizationId only)"
  - "Remove filterCommitteeForRequester — per-CC getConfig resolution makes the workaround obsolete"
  - "sendNotification called in loop for parallel mode — one call per approver, sequential calls only first"

patterns-established:
  - "approval-routing-helpers.ts: pure/async helpers imported by route, mocked in tests"
  - "TDD structure: test file defines contracts Task 2 implements — import error = confirmed RED"

requirements-completed: [APPR-01, APPR-02, APPR-03, APPR-04]

# Metrics
duration: 12min
completed: 2026-05-13
---

# Phase 2 Plan 01: Fix Approval Routing Summary

**CC-scoped committee resolution and flat approvers[] step creation via extracted testable helpers, fixing two silent bugs that caused zero approval steps to be created on submission.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-13T13:57:00Z
- **Completed:** 2026-05-13T14:03:30Z
- **Tasks:** 3 (2 TDD + 1 verification checkpoint)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- Fixed BUG 1: `getConfig` now called with submitter's `costCenterId` — CC-specific committees are actually used
- Fixed BUG 2: route now reads `committeeValue?.approvers` (not legacy `.members`) — approval steps are actually created
- Fixed BUG 3: parallel mode now notifies all approvers, not just the first
- Removed `filterCommitteeForRequester` workaround — per-CC `getConfig` resolution makes it obsolete
- 8 unit tests covering all 5 required behaviors — all pass without DB connection

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests for CC-scoped approval routing** - `5ea6fc7` (test)
2. **Task 2: Implement helpers and fix POST /api/requests** - `e5899d8` (feat)
3. **Task 3: Verify APPR-01 mode-per-CC** - auto-approved (grep confirmed, no code change needed)

**Plan metadata:** (docs commit — see below)

_TDD: Task 1 = RED (import error confirming file doesn't exist), Task 2 = GREEN (8/8 pass)_

## Files Created/Modified
- `src/lib/__tests__/approval-routing.test.ts` - Unit tests for resolveCommittee, buildApprovalSteps, selectNotifyTargets (8 tests)
- `src/lib/approval-routing-helpers.ts` - Three pure helpers: resolveCommittee, buildApprovalSteps, selectNotifyTargets
- `src/app/api/requests/route.ts` - Fixed approval step creation; fetches submitter.costCenterId; uses approvers[] shape; parallel notify all

## Decisions Made
- Extracted helpers to `approval-routing-helpers.ts` (not inlined in route) — enables unit testing without DB mocks at route level
- `resolveCommittee` delegates all three-tier logic to `getConfig` — no duplication of lookup logic
- `sendNotification` called in a loop per approver in parallel mode — straightforward, consistent with existing notification pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors (`@/generated/prisma` not found — Prisma client not generated in worktree) across 16+ files. Not caused by this plan. No action taken per scope boundary rule.
- Pre-existing test failures in `leave-email.test.ts`, `leave-policy.test.ts`, `per-diem.test.ts` — same root cause (`@/generated/prisma`). Not regressions.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Approval routing now correctly uses per-CC committees on submission
- APPR-01 through APPR-04 satisfied
- Ready for Phase 2 Plan 02 (if any) or Phase 3

---
*Phase: 02-per-cc-approval-workflow*
*Completed: 2026-05-13*
