---
phase: 03-per-cc-policies-deadlines
plan: "02"
subsystem: ui
tags: [deadlines, config, cc-scoped, admin-dashboard, employee-ui, public-api]

dependency_graph:
  requires:
    - phase: 03-per-cc-policies-deadlines
      plan: "01"
      provides: [paymentDeadline key in VALID_KEYS, isOverduePayment helper, cc-scoped getConfig pattern]
  provides:
    - paymentDeadline admin config UI field with save/load
    - CC-scoped public config endpoint returning approvalDeadline + paymentDeadline
    - Overdue payments section in admin dashboard
    - Approval + payment deadline status banners on employee request detail
  affects: [admin-dashboard, employee-request-detail, public-config-api]

tech-stack:
  added: []
  patterns:
    - addBusinessDays-local-helper (duplicated in employee page, avoids cross-module import from server component)
    - typeof-number-guard (coerce raw config values to number | null before use)
    - iife-in-jsx ((() => { ... })() pattern for conditional deadline banner rendering)

key-files:
  created: []
  modified:
    - src/app/(admin)/admin/config/page.tsx
    - src/app/api/config/public/route.ts
    - src/app/(admin)/admin/page.tsx
    - src/app/(employee)/employee/requests/[id]/page.tsx

key-decisions:
  - "updatedAt used as approvedAt proxy for payment deadline — updates on status change, simple and accurate"
  - "approvalDeadline config is a bare number (03-01 decision), not {businessDays: number} object — fixed admin page extraction"
  - "Public config endpoint now CC-scoped via user.costCenterId + organizationId lookup"

patterns-established:
  - "Public config endpoint pattern: resolve caller's org+CC, then getConfig() for each key in parallel"

requirements-completed:
  - DEAD-01
  - DEAD-02
  - DEAD-03
  - DEAD-04
  - DEAD-05

duration: 12min
completed: "2026-05-13"
---

# Phase 3 Plan 02: Deadline UI Summary

**Payment deadline admin UI field, CC-scoped public config endpoint, overdue payment detection in admin dashboard, and approval/payment deadline status banners on employee request detail page.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-13T10:17:05Z
- **Completed:** 2026-05-13T10:29:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Admin config Deadlines section now has a paymentDeadline number input that saves and loads per CC
- /api/config/public rewritten to use getConfig() with the calling user's org+CC scope, returning approvalDeadline and paymentDeadline
- Admin dashboard shows overdue payments stat card (amber) and full list of APPROVED requests past paymentDeadline business days from updatedAt
- Employee request detail page shows "Approval due by [date]" or "Approval overdue by N days" when SUBMITTED, and "Payment due by [date]" or "Payment overdue by N days" when APPROVED

## How Overdue Payment Detection Works

APPROVED requests use `updatedAt` as a proxy for `approvedAt`. When a request moves to APPROVED status, Prisma updates `updatedAt` automatically. The admin dashboard adds `paymentDeadlineDays` business days (skipping weekends) to `updatedAt`. If the resulting date is in the past, the request appears in the overdue payments list.

**Rationale for updatedAt proxy:** The schema has no dedicated `approvedAt` field. `updatedAt` is the simplest correct proxy — it changes whenever status changes, so for APPROVED requests it reliably reflects when approval happened. If a request's amount or other fields were edited after approval (not a current workflow), this would be inaccurate, but that case does not exist in the current system.

## Where Deadline Status Renders in Employee UI

The deadline status banner renders inside the Approval Timeline card in the employee request detail page (`src/app/(employee)/employee/requests/[id]/page.tsx`), above the approval steps list. It uses an IIFE pattern (immediately invoked function expression) in JSX to compute and render the banner conditionally:

- `status === "SUBMITTED"` + `approvalDeadlineDays != null` → Approval deadline banner (amber if upcoming, red if overdue)
- `status === "APPROVED"` + `paymentDeadlineDays != null` → Payment deadline banner (amber if upcoming, red if overdue)

The deadline config is fetched from `/api/config/public` in a separate `useEffect` on component mount.

## Task Commits

Each task was committed atomically:

1. **Task 1: paymentDeadline admin config UI field + fix public config endpoint CC scope** - `3f19d8a` (feat)
2. **Task 2: Overdue payments section in admin dashboard + employee deadline status on request detail** - `c00ece6` (feat)

## Files Created/Modified

- `src/app/(admin)/admin/config/page.tsx` - Added paymentDeadline state var, load/save handlers, number input in Deadlines section
- `src/app/api/config/public/route.ts` - Rewritten to use getConfig() with CC scope, returns approvalDeadline + paymentDeadline
- `src/app/(admin)/admin/page.tsx` - Added paymentDeadlineConfig fetch, overduePayments computation, Overdue Payments stat card + list section; fixed approvalDeadline bare-number extraction bug
- `src/app/(employee)/employee/requests/[id]/page.tsx` - Added approvalDeadlineDays/paymentDeadlineDays state, /api/config/public fetch effect, addBusinessDays helper, deadline status banners

## Decisions Made

- **updatedAt as approvedAt proxy:** No `approvedAt` field in schema. `updatedAt` changes on status change, reliable for detecting when APPROVED.
- **approvalDeadline bare number fix:** The admin dashboard was incorrectly reading `approvalDeadlineConfig` using `.businessDays` object shape (from a pre-03-01 assumption). Fixed to use `typeof ... === "number"` guard consistent with 03-01 decision.
- **IIFE in JSX for banners:** Avoids extracting a separate component for one-off conditional rendering blocks with local variable computation.

## Known Limitation

Limit enforcement amounts are in request currency, not normalized to a base currency. This is a pre-existing limitation documented in the project and is out of scope for this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed approvalDeadline bare-number extraction in admin dashboard**
- **Found during:** Task 2 (admin dashboard overdue payments section)
- **Issue:** Admin page was using `(approvalDeadlineConfig as { businessDays?: number } | null)?.businessDays ?? 3` which would always return the fallback `3` since 03-01 changed storage to bare number format
- **Fix:** Changed to `typeof approvalDeadlineConfig === "number" ? approvalDeadlineConfig : 3`
- **Files modified:** src/app/(admin)/admin/page.tsx
- **Verification:** TypeScript passes, no new type errors introduced
- **Committed in:** c00ece6 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Fix was necessary for correct behavior. The approvalDeadline config would have always fallen back to hardcoded 3 days instead of using the configured value.

## Issues Encountered

Pre-existing TypeScript `implicit any` errors exist in admin/page.tsx callback parameters (`.filter((step) =>`, `.map((s) =>`, etc.) from before this plan. These were scoped as out-of-plan, not fixed. The new `approvedRequests.filter((req) =>` used explicit type annotation `(req: ApprovedReq)` to avoid introducing new implicit-any errors.

Pre-existing vitest failures in leave-email, leave-policy, and per-diem test files (Prisma generated client missing) — 112 other tests all pass including the 16 submission-limits tests from Plan 01.

## Next Phase Readiness

- All 5 DEAD requirements (DEAD-01 through DEAD-05) are now satisfied
- Phase 3 (Per-CC Policies & Deadlines) is complete — ready for Phase 4 (Expense Categories)
- Public config endpoint is CC-scoped and extensible for future config keys

---
*Phase: 03-per-cc-policies-deadlines*
*Completed: 2026-05-13*
