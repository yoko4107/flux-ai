---
phase: 01-cost-center-config-scoping
plan: "02"
subsystem: ui
tags: [react, typescript, next.js, admin-config, cost-center, ui-component]

requires:
  - "01-api-extension-SUMMARY.md: GET /api/admin/config?costCenterId= and PUT with costCenterId body"
provides:
  - "CostCenterSelector shared component: card-grid selector exported from src/components/admin/CostCenterSelector.tsx"
  - "CostCenter type exported from shared component location"
  - "/admin/config page scoped to selected CC: all reads and writes use selectedCC.id"
  - "Auto-select first CC on mount; useEffect re-fetches config on CC change"
  - "Building2 active-CC indicator bar below selector"
  - "Empty-CC state with link to /admin/cost-centers"
affects:
  - future phases (all config reads/writes now CC-scoped)

tech-stack:
  added: []
  patterns:
    - "Load CCs once on mount (empty deps useEffect); load config on selectedCC?.id change (separate useEffect)"
    - "saveConfig(key, value, costCenterId) — costCenterId passed at call time, not captured in closure"
    - "Shared component at src/components/admin/ — additive, original payroll component unchanged"
    - "Inline CC-loading state (loadingCCs) — does not block full page render"

key-files:
  created:
    - src/components/admin/CostCenterSelector.tsx
  modified:
    - src/app/(admin)/admin/config/page.tsx

key-decisions:
  - "Create shared CostCenterSelector at src/components/admin/ — additive location, payroll original preserved"
  - "Export CostCenter type from shared component so importing pages need not redeclare it"
  - "Two separate useEffects: one for CC list (mount-only), one for config (selectedCC?.id dep) — prevents loading config before CCs arrive"
  - "Pass costCenterId at saveConfig call time — avoids stale closure capturing null before CC loads"
  - "Inline loadingCCs state rather than blocking full page — page shows loading config but CC selector loads independently"

metrics:
  duration: "3min"
  completed: "2026-05-13"
  tasks: 2
  files_modified: 2
---

# Phase 1 Plan 02: UI CC Selector Summary

**Cost center selector added to /admin/config: card-grid selector auto-selects first CC, re-fetches all config on CC switch, and scopes all 7 save handlers to the selected CC's id**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-13T05:58:26Z
- **Completed:** 2026-05-13T06:01:29Z
- **Tasks:** 2 (+ 1 auto-approved checkpoint)
- **Files modified:** 2

## Accomplishments

- Created `src/components/admin/CostCenterSelector.tsx` — shared component with `"use client"` directive and exported `CostCenter` type, body identical to existing payroll component
- Updated `/admin/config` page with:
  - `costCenters`, `selectedCC`, `loadingCCs` state
  - Mount-only `useEffect` to load CC list and auto-select first
  - `loadData(ccId)` updated to fetch `?costCenterId=` when CC selected
  - `useEffect` on `selectedCC?.id` to re-fetch config on CC switch (prevents stale data)
  - `saveConfig(key, value, costCenterId)` — costCenterId passed at call time
  - All 7 save handlers updated to pass `selectedCC?.id ?? null`
  - CC selector card-grid and Building2 active-CC indicator above all section cards
  - Empty-CC state with link to `/admin/cost-centers`

## Task Commits

1. **Task 1: Create shared CostCenterSelector component** - `b88dd60` (feat)
2. **Task 2: Wire CC selector and re-fetch into config page** - `f877c88` (feat)

## Files Created/Modified

- `src/components/admin/CostCenterSelector.tsx` - Shared card-grid component with `"use client"`, exported `CostCenter` type, exported `CostCenterSelector` function
- `src/app/(admin)/admin/config/page.tsx` - CC selector state, dual useEffects, scoped loadData, scoped saveConfig, CC indicator bar, empty-CC state

## Decisions Made

- Shared component at `src/components/admin/` — additive, payroll original at `cost-centers/payroll/components/` left unchanged
- Export `CostCenter` type from shared location so config page and future importers need not redeclare it
- Two separate useEffects: CC list loads once on mount, config re-fetches on `selectedCC?.id` change — prevents config fetch before CCs arrive
- `costCenterId` passed as argument at `saveConfig` call time — avoids stale closure issue where null is captured before CC loads

## Checkpoint

**Task 3 (checkpoint:human-verify):** Auto-approved per `workflow.auto_advance: true` in config.json.

What was built: CC selector card-grid on `/admin/config`, first CC auto-selected on mount, re-fetch triggered on CC switch (Network tab shows new `?costCenterId=` request), PUT body includes `costCenterId`, Building2 indicator shows selected CC name at all times, empty-CC state links to `/admin/cost-centers`.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- Pre-existing TypeScript errors in unrelated files (scripts, approver, finance pages) — out of scope, not introduced by this plan
- Pre-existing vitest failures in `leave-email`, `leave-policy`, `per-diem` suites due to missing prisma `./client` module in worktree — out of scope, all 85 actual tests pass including config-scoping tests from Plan 01

## Next Phase Readiness

- UI layer is complete: admins can select a CC, see the active indicator, switch CCs, and all config reads/writes are scoped to the selected CC
- Phase 1 (Foundation) fully complete: API extension (Plan 01) + UI selector (Plan 02)
- Ready to proceed to Phase 2 (Per-CC Approval Workflow)

---
*Phase: 01-cost-center-config-scoping*
*Completed: 2026-05-13*
