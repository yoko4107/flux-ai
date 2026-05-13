---
phase: 01-cost-center-config-scoping
plan: "01"
subsystem: api
tags: [prisma, typescript, zod, vitest, admin-config, cost-center]

requires: []
provides:
  - "mergeConfigs() pure function: CC rows win over org-wide rows for same key, with fallback"
  - "validateCCOwnership() async function: validates CC belongs to org, null always valid"
  - "GET /api/admin/config?costCenterId=X returns CC-specific rows merged over org-wide rows"
  - "GET /api/admin/config (no param) returns org-wide rows only (no regression)"
  - "PUT /api/admin/config with costCenterId validates ownership and writes CC-specific row"
  - "PUT with foreign costCenterId returns 403"
affects:
  - 02-cost-center-config-scoping
  - ui-config-scoping

tech-stack:
  added: []
  patterns:
    - "mergeConfigs<T extends AdminConfigRow>(ccRows, orgRows): T[] — CC rows override same-key org rows via Map iteration"
    - "validateCCOwnership(prisma, costCenterId, orgId) — null costCenterId returns sentinel {id:''} (always valid)"
    - "(ccId ?? null) as unknown as string — required Prisma null cast for compound unique where clauses"
    - "typeof orgConfigs cast on ccConfigs to preserve concrete Prisma type through generic mergeConfigs"

key-files:
  created:
    - src/lib/config-scoping.ts
    - src/lib/__tests__/config-scoping.test.ts
  modified:
    - src/app/api/admin/config/route.ts

key-decisions:
  - "Use Map-based merge in mergeConfigs: iterate orgRows first (set base), then ccRows (overwrite) — O(n) with last-write-wins semantics"
  - "null costCenterId always valid — validateCCOwnership returns sentinel {id:''} to avoid DB query for org-wide writes"
  - "Cast mergeConfigs result as typeof orgConfigs to preserve Prisma concrete type — generic constraint AdminConfigRow only requires key+value"
  - "Fetch orgConfigs before ccConfigs in GET handler so typeof orgConfigs can be used to type the conditional empty array"

patterns-established:
  - "Config merge pattern: fetch CC rows + org rows separately, call mergeConfigs(), iterate merged result"
  - "CC ownership validation pattern: check ccId truthy first, call validateCCOwnership, return 403 if null"
  - "Null cast pattern for Prisma compound keys: (ccId ?? null) as unknown as string"

requirements-completed:
  - NAV-01
  - NAV-02

duration: 10min
completed: 2026-05-13
---

# Phase 1 Plan 01: API Extension Summary

**Cost-center-scoped AdminConfig API: GET merges CC+org rows with fallback, PUT validates CC ownership and writes to CC-specific row using dynamic Prisma compound key**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-13T05:52:00Z
- **Completed:** 2026-05-13T05:55:08Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Extracted `config-scoping.ts` library with `mergeConfigs()` and `validateCCOwnership()` pure/async functions, covered by 9 Vitest unit tests
- Extended GET handler to accept `?costCenterId` param, fetch CC-specific rows, and merge them over org-wide fallback rows using `mergeConfigs()`
- Extended PUT handler with `costCenterId` Zod field, CC ownership validation (403 on failure), and dynamic Prisma upsert targeting CC-specific rows

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract config-scoping lib with unit tests** - `f411777` (feat)
2. **Task 2: Extend route.ts GET and PUT to thread costCenterId** - `8aae80f` (feat)

## Files Created/Modified
- `src/lib/config-scoping.ts` - Pure mergeConfigs() and async validateCCOwnership() exported functions
- `src/lib/__tests__/config-scoping.test.ts` - 9 unit tests: 5 for mergeConfigs, 4 for validateCCOwnership
- `src/app/api/admin/config/route.ts` - Extended GET (CC fetch + merge) and PUT (costCenterId field, ownership check, dynamic upsert)

## Decisions Made
- Used Map-based merge: orgRows set as base, ccRows overwrite — O(n+m), last-write-wins
- `validateCCOwnership` returns `{ id: "" }` sentinel for null costCenterId to avoid DB query for org-wide paths
- Cast `mergeConfigs` result as `typeof orgConfigs` to recover concrete Prisma type lost through generic constraint
- Declared `orgConfigs` before `ccConfigs` in GET handler so `typeof orgConfigs` can be used to type the conditional empty array

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed index signature from AdminConfigRow type**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** `AdminConfigRow` had `[key: string]: unknown` index signature causing TypeScript to widen all specific properties (updatedAt, updatedBy) to `unknown` in the merge result
- **Fix:** Removed the index signature; constraint only requires `key` and `value`. Added `as typeof orgConfigs` cast on the `mergeConfigs` result to recover the concrete Prisma type
- **Files modified:** src/lib/config-scoping.ts, src/app/api/admin/config/route.ts
- **Verification:** `npx tsc --noEmit` shows no errors in admin/config/route.ts
- **Committed in:** 8aae80f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type system bug)
**Impact on plan:** Essential fix for TypeScript correctness. No scope creep.

## Issues Encountered
- TypeScript generic constraint `AdminConfigRow` with index signature caused property widening to `unknown` — resolved by removing index signature and casting the return value to the concrete Prisma type

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Data layer complete: API now correctly scopes reads and writes to cost-center-specific AdminConfig rows
- `mergeConfigs` and `validateCCOwnership` are importable by any future UI or API code
- Plan 02 (UI extension) can now call `GET /api/admin/config?costCenterId=X` and `PUT /api/admin/config` with `costCenterId` in the body

---
*Phase: 01-cost-center-config-scoping*
*Completed: 2026-05-13*
