---
phase: 05-validation-polish
plan: 01
subsystem: ui
tags: [react, nextjs, dirty-tracking, validation, useRef, useState]

# Dependency graph
requires:
  - phase: 04-payroll
    provides: admin config page with all save handlers and field-change handlers established
provides:
  - dirtyKeys state + savedRef snapshot enabling unsaved-changes detection
  - beforeunload guard preventing accidental tab close with unsaved edits
  - handleDiscardAll() restoring all fields from last load/save snapshot
  - Amber unsaved-changes banner with Discard button in CC branch
  - committeeError inline validation blocking save with zero approvers
  - React.Fragment key fix in WorkflowPreviewCard sequential mode
  - ENFC-01 enforcement verification comment in approve route
affects: [admin-config, workflow-preview, approval-routing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dirty tracking via Set<string> of changed keys + useRef snapshot for discard"
    - "markDirty(key)/markClean(...keys) helper pattern for field/save handler pairing"
    - "beforeunload useEffect gated on isDirty boolean derived from dirtyKeys.size > 0"

key-files:
  created: []
  modified:
    - src/app/(admin)/admin/config/page.tsx
    - src/app/api/requests/[id]/approve/route.ts

key-decisions:
  - "Used Set<string> for dirtyKeys instead of boolean to enable per-section clean marking after individual saves"
  - "savedRef stores a flat snapshot matching savedRef.current keys to state variable names for symmetrical discard"
  - "committeeError rendered inline as <p className='text-sm text-red-500'> (not toast) per plan spec"
  - "ENFC-01: approve route verified correct for both sequential and parallel modes — no code changes needed"

patterns-established:
  - "Dirty tracking pattern: markDirty on every user-triggered onChange, markClean after toast.success in save handler"
  - "savedRef snapshot pattern: populated at end of loadData block + updated in each save handler after markClean"

requirements-completed: [CONF-01, CONF-02, CONF-04, CONF-05, ENFC-01]

# Metrics
duration: 25min
completed: 2026-05-14
---

# Phase 5 Plan 1: Validation & Polish Summary

**Dirty tracking with savedRef snapshot, beforeunload guard, inline committee validation, React Fragment key fix, and ENFC-01 enforcement verification on the admin config page**

## Performance

- **Duration:** 25 min
- **Started:** 2026-05-14T10:45:00Z
- **Completed:** 2026-05-14T11:10:00Z
- **Tasks:** 5
- **Files modified:** 2

## Accomplishments
- Added complete dirty tracking system: dirtyKeys Set + savedRef + markDirty/markClean helpers wired into all 16+ field handlers and 10 save handlers
- Added beforeunload guard (fires native browser dialog on tab close when isDirty) and handleDiscardAll() restoring all fields from savedRef snapshot
- Added amber unsaved-changes banner with Discard button rendered in the cost-center-present JSX branch
- Added committeeError state + empty-committee guard blocking save API call when approvers.length === 0 with inline red error message
- Fixed React Fragment key warning in WorkflowPreviewCard sequential map: `<React.Fragment key={step.id}>` replaces shorthand `<>` with misplaced key on inner span
- Verified ENFC-01 enforcement in approve route (sequential step-by-step gating + parallel all-must-approve both correct); documented findings as comment block

## Task Commits

Each task was committed atomically:

1. **Tasks 1-4: Dirty tracking, banner, committee guard, React key fix** - `e59370b` (feat)
2. **Task 5: ENFC-01 verification comment** - `7a3cfd3` (docs)

## Files Created/Modified
- `src/app/(admin)/admin/config/page.tsx` - Added dirty tracking infrastructure (22 markDirty calls, 13 savedRef references, isDirty banner, beforeunload effect, handleDiscardAll, committeeError, React.Fragment fix)
- `src/app/api/requests/[id]/approve/route.ts` - Added ENFC-01 verification comment block at file top

## Decisions Made
- Used `Set<string>` for dirtyKeys (not a single boolean) to support per-section markClean after individual section saves without clearing unrelated dirty sections
- savedRef stores a flat-key snapshot (committee, financeOfficerId, submissionDeadline, etc.) matching state variable names for simple discard loop
- committeeError is inline `<p className="text-sm text-red-500">` not a toast, so the error persists visibly without requiring re-triggering
- ENFC-01 finding: route is correct for both modes — the nextStep notification in parallel mode sends a courtesy reminder to remaining approvers (acceptable behavior), and the allSteps.every(APPROVED) gate is correct

## Deviations from Plan

None - plan executed exactly as written. The handleSaveCommittee guard and committeeError state were folded into the single save handler update (Tasks 1 and 3 overlapped on handleSaveCommittee — handled without duplication).

## Issues Encountered
- Pre-existing TypeScript errors in generated Prisma types and other files unrelated to this plan (not introduced, not fixed per scope boundary rule)
- Pre-existing test suite failures (3 suites failing due to missing Prisma client module) — all 120 tests that run pass

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Admin config page is fully polished: dirty tracking, unsaved warning, discard, committee validation, React key fix
- Enforcement verified correct end-to-end for both sequential and parallel approval routing
- Phase 5 plan 1 complete; remaining validation/polish work (if any) can proceed

---
*Phase: 05-validation-polish*
*Completed: 2026-05-14*
