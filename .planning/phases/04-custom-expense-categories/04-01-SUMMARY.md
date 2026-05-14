---
phase: 04-custom-expense-categories
plan: 01
subsystem: api
tags: [prisma, zod, vitest, custom-categories, config]

# Dependency graph
requires:
  - phase: 03-per-cc-policies-deadlines
    provides: CC-scoped getConfig helper and AdminConfig key pattern used by customCategories registration
provides:
  - CustomCategory interface, customCategorySchema Zod validator, mergeCategories() pure helper
  - customCategories key registered in VALID_KEYS and valueSchemas for admin config PUT/GET
  - GET /api/config/public returns customCategories (enabled only) and allCategories (merged) fields
  - POST /api/requests accepts custom category codes, maps to Category.OTHER in DB
affects:
  - 04-02-frontend (employee submission form reads allCategories from public config)
  - 05-role-management (no direct dependency)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure helper for merging Prisma enum defaults with custom codes; avoids runtime Prisma import for testability"
    - "DEFAULT_CATEGORY_CODES constant mirrors Prisma enum without requiring runtime import"
    - "v1 DB constraint: custom category codes stored as Category.OTHER, semantic code preserved in description"
    - "TDD wave pattern: failing test stubs committed (Wave 0), then implementation (Wave 1)"

key-files:
  created:
    - src/lib/custom-categories.ts
    - src/lib/__tests__/custom-categories.test.ts
  modified:
    - src/app/api/admin/config/route.ts
    - src/app/api/config/public/route.ts
    - src/app/api/requests/route.ts

key-decisions:
  - "DEFAULT_CATEGORY_CODES constant in custom-categories.ts avoids Prisma runtime import to keep unit tests fast"
  - "v1: custom category codes stored as Category.OTHER in DB; semantic code lives in description (no Prisma schema change)"
  - "No deduplication in mergeCategories() — custom code matching an enum code appears twice (v1 spec)"
  - "allCategories field in public config = full merged list; customCategories field = enabled custom entries only"
  - "POST /api/requests guard replaced: enum-only check removed, regex /^[A-Z0-9_]+$/ allows custom codes at DRAFT stage"

patterns-established:
  - "mergeCategories(raw): pure helper that accepts unknown input, returns string[] — safe to call with untyped getConfig result"
  - "customCategories in AdminConfig follows same VALID_KEYS + valueSchemas pattern as all other config keys"

requirements-completed:
  - CATG-01
  - CATG-02
  - CATG-03

# Metrics
duration: 25min
completed: 2026-05-14
---

# Phase 4 Plan 01: Backend SUMMARY

**CustomCategory Zod type + mergeCategories() helper wired into admin config API, public config GET, and POST /api/requests with custom code -> Category.OTHER DB mapping**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-14T09:50:00Z
- **Completed:** 2026-05-14T10:18:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Created `src/lib/custom-categories.ts` with `CustomCategory` interface, `customCategorySchema` Zod validator, and `mergeCategories()` pure helper (12 defaults + enabled custom codes)
- Registered `customCategories` key in admin config route VALID_KEYS + valueSchemas (Zod array validation)
- Extended public config GET to return `customCategories` (enabled entries) and `allCategories` (merged list) per caller's CC
- Updated POST /api/requests to load CC-scoped `customCategories`, merge into `allowedCategories`, accept custom codes, and map to `Category.OTHER` in DB
- 8 unit tests green (5 mergeCategories, 3 customCategorySchema)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create failing test stubs (Wave 0)** - `1cd3964` (test)
2. **Task 2: Implement custom-categories.ts + admin config route** - `ba3ddd9` (feat)
3. **Task 3: Wire into public config + POST /api/requests** - `71ad749` (feat)

## Files Created/Modified
- `src/lib/custom-categories.ts` - CustomCategory interface, customCategorySchema, mergeCategories() pure helper
- `src/lib/__tests__/custom-categories.test.ts` - 8 Vitest unit tests
- `src/app/api/admin/config/route.ts` - customCategories added to VALID_KEYS and valueSchemas
- `src/app/api/config/public/route.ts` - customCategories + allCategories fields in GET response
- `src/app/api/requests/route.ts` - custom category support: guard, merge, dbCategory mapping

## Decisions Made
- Used `DEFAULT_CATEGORY_CODES` constant instead of `import { Category }` from `@/generated/prisma` — the worktree Prisma client isn't generated, making runtime value imports fail in unit tests. Constant mirrors the schema enum exactly.
- `allCategories` field added to public config (not planned explicitly) to give the employee form a single ready-to-use list including custom codes.
- No deduplication in v1: if a custom code matches an enum code, it appears twice (matches spec).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced Prisma Category runtime import with DEFAULT_CATEGORY_CODES constant**
- **Found during:** Task 2 (implement custom-categories.ts)
- **Issue:** `import { Category } from "@/generated/prisma"` caused "Cannot find module './client'" in vitest because the worktree's Prisma client is not generated. All 8 tests failed with module error.
- **Fix:** Replaced with `DEFAULT_CATEGORY_CODES` string constant listing the 12 enum values. Pure helper remains testable without DB connection.
- **Files modified:** src/lib/custom-categories.ts
- **Verification:** All 8 unit tests pass after fix
- **Committed in:** ba3ddd9 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Fixed TypeScript type error introduced by allowedCategories spread**
- **Found during:** Task 3 (POST /api/requests)
- **Issue:** Inline spread `[...unknownArray, ...string[]]` inferred as `unknown[]`, not assignable to `string[]`
- **Fix:** Extracted to typed constants `baseAllowed: string[]` and `customOnlyCodes: string[]` before spread
- **Files modified:** src/app/api/requests/route.ts
- **Verification:** `npx tsc --noEmit` no longer shows error on that line
- **Committed in:** 71ad749 (Task 3 commit, amended before commit)

---

**Total deviations:** 2 auto-fixed (1 testability bug, 1 TypeScript type correction)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
- Pre-existing test failures in leave-email.test.ts, leave-policy.test.ts, per-diem.test.ts (unrelated to this plan, caused by missing Prisma client in worktree) — not fixed per scope boundary rule.
- Pre-existing TypeScript errors in requests/route.ts for Category/RequestStatus exports from `@/generated/prisma` (pre-existed before my changes, confirmed by git stash test).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend foundation for Phase 4 complete: customCategories stored, merged, and enforced at submission
- Phase 4 Plan 02 (frontend) can read `allCategories` from GET /api/config/public to populate the submission form
- No Prisma schema changes; custom codes stored as Category.OTHER in DB (v1 constraint)

---
*Phase: 04-custom-expense-categories*
*Completed: 2026-05-14*
