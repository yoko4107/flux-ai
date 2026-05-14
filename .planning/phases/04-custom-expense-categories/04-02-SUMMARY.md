---
phase: 04-custom-expense-categories
plan: 02
subsystem: ui
tags: [react, typescript, nextjs, admin, config]

# Dependency graph
requires:
  - phase: 04-01-backend
    provides: CustomCategory type, customCategories config key, mergeCategories, API storage

provides:
  - Custom Categories SectionCard in admin config page with add/rename/toggle/remove UI
  - AddCustomCategoryRow form component with client-side validation
  - customCategories state + loadData hydration + handleSaveCustomCategories handler

affects: [employees submitting requests, config page rendering]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AddCustomCategoryRow placed above AdminConfigPage to avoid re-creation on render"
    - "CATEGORIES constant moved to module scope for shared reference across components"
    - "Inline rename via controlled input directly in the list row (no separate edit mode)"

key-files:
  created: []
  modified:
    - src/app/(admin)/admin/config/page.tsx

key-decisions:
  - "CATEGORIES constant moved to module scope so AddCustomCategoryRow can reference it via existingCodes prop"
  - "AddCustomCategoryRow placed above AdminConfigPage as a standalone component to avoid hook rules violation"
  - "No maxAmount UI field per CATG-05 deferral — stays out of scope for v1"

patterns-established:
  - "AddCustomCategoryRow: controlled form with local state + validation, calls onAdd callback"
  - "Inline editing pattern: row input directly mutates parent state via setCustomCategories map"
  - "else branch in loadData ensures customCategories resets to [] when CC has no custom categories"

requirements-completed:
  - CATG-01
  - CATG-02
  - CATG-03

# Metrics
duration: 15min
completed: 2026-05-14
---

# Phase 4 Plan 02: Admin UI for Custom Expense Categories Summary

**Custom Categories SectionCard added to admin config page with inline add/rename/toggle/remove UI wired to existing saveConfig() and loadData() patterns**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-14T10:30:00Z
- **Completed:** 2026-05-14T10:45:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `customCategories` state, hydration in `loadData` (with else-reset branch for CC switch), and `handleSaveCustomCategories()` handler
- Added `AddCustomCategoryRow` standalone component with validation (non-empty name, uppercase code regex, uniqueness vs defaults + existing custom codes)
- Added Custom Categories SectionCard after Allowed Categories with inline row editing (rename, toggle enabled, remove)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add customCategories state, hydration, and save handler** - `a5dd481` (feat)
2. **Task 2: Add Custom Categories SectionCard UI with add/rename/toggle/remove** - `6bed87c` (feat)

**Plan metadata:** (created in final commit)

## Files Created/Modified

- `src/app/(admin)/admin/config/page.tsx` - CustomCategory import, state, hydration, save handler, AddCustomCategoryRow component, SectionCard JSX

## Decisions Made

- Moved `CATEGORIES` constant from inside `AdminConfigPage` body to module scope so it can be passed to `AddCustomCategoryRow` via the `existingCodes` prop without re-creation
- Placed `AddCustomCategoryRow` above `AdminConfigPage` (not inside it) to avoid violating React hooks rules
- No maxAmount per custom category field — CATG-05 deferred to v2 per plan spec

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Moved CATEGORIES constant to module scope**
- **Found during:** Task 2 (SectionCard UI implementation)
- **Issue:** CATEGORIES was defined inside AdminConfigPage body after the early `if (loading)` return, making it inaccessible before the return and unavailable to AddCustomCategoryRow which is defined outside the component
- **Fix:** Moved `const CATEGORIES = [...]` from inside AdminConfigPage to module scope, removed it from the component body
- **Files modified:** src/app/(admin)/admin/config/page.tsx
- **Verification:** TypeScript compiles with 0 errors in admin/config, CATEGORIES referenced correctly in both category table and AddCustomCategoryRow existingCodes prop
- **Committed in:** 6bed87c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — constant scope placement)
**Impact on plan:** Necessary structural fix. No scope creep.

## Issues Encountered

Pre-existing test failures in 3 test files (`leave-email.test.ts`, `leave-policy.test.ts`, `per-diem.test.ts`) due to missing generated Prisma client file. All 120 actual tests pass. These failures pre-exist and are out of scope for this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 4 complete (both plans done): CATG-01, CATG-02, CATG-03 satisfied
- Custom categories stored as JSON in AdminConfig, merged into allCategories for employees
- Ready to proceed to Phase 5: Role Management

---
*Phase: 04-custom-expense-categories*
*Completed: 2026-05-14*
