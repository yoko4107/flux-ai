---
phase: 03-per-cc-policies-deadlines
plan: "01"
subsystem: submission-limits
tags: [tdd, config, enforcement, auto-approve, cc-scoped]
dependency_graph:
  requires: []
  provides: [submission-limits-helpers, cc-scoped-config-at-submission, auto-approve-logic]
  affects: [src/app/api/requests/route.ts, src/lib/submission-limits.ts, src/app/api/admin/config/route.ts]
tech_stack:
  added: []
  patterns: [pure-helper-extraction, tdd-red-green, cc-scoped-getconfig, details-array-error-response]
key_files:
  created:
    - src/lib/submission-limits.ts
    - src/lib/__tests__/submission-limits.test.ts
  modified:
    - src/app/api/requests/route.ts
    - src/app/api/admin/config/route.ts
    - src/app/(admin)/admin/config/page.tsx
    - src/app/(employee)/employee/requests/page.tsx
decisions:
  - "Auto-approve (shouldAutoApprove) returns 201 APPROVED immediately with no approval steps, no committee notification"
  - "submissionDeadline stored as bare number (not { day: number }) — config page already used typeof check"
  - "approvalThreshold=0 means disabled; threshold only active when > 0"
  - "CC-scoped config block runs even before request creation — submitter resolution moved before validation block"
  - "financeOfficer key added to VALID_KEYS at same time as the three plan keys (was missing from previous phase)"
metrics:
  duration_seconds: 233
  completed_date: "2026-05-13"
  tasks_completed: 3
  files_changed: 6
---

# Phase 3 Plan 01: Limit Enforcement Summary

**One-liner:** CC-scoped submission enforcement with pure validateSubmission/shouldAutoApprove helpers replacing broken bare findMany() config reads.

## What Was Built

### src/lib/submission-limits.ts (new)
Pure, DB-free helper module with three exported functions:
- `validateSubmission(amount, category, receiptUrl, config, todayDate?)` — returns `string[]` error array (empty = valid). Checks allowed categories, per-category limits, per-request overall limit, receipt requirement, and submission deadline (bare number shape).
- `shouldAutoApprove(amount, approvalThreshold)` — returns true only when threshold > 0 and amount <= threshold.
- `isOverduePayment(approvedAt, paymentDeadlineDays, now?)` — adds business days (skipping weekends) to approvedAt and checks if deadline has passed.

### src/lib/__tests__/submission-limits.test.ts (new)
16 unit tests covering all branches, including boundary conditions, disabled threshold (0), null deadline, and weekend-skipping business day calculation.

### src/app/api/requests/route.ts (modified)
- Replaced bare `prisma.adminConfig.findMany()` with 6 parallel CC-scoped `getConfig(prisma, key, orgId, submitterCCId)` calls.
- Submitter resolution (costCenterId + organizationId) moved before the config block.
- Manual validation checks replaced with `validateSubmission()`.
- Auto-approve block added: when `shouldAutoApprove()` returns true, request is immediately updated to APPROVED with audit log, and the function returns early (no approval steps created, no committee notification).

### src/app/api/admin/config/route.ts (modified)
Added to `VALID_KEYS` and `valueSchemas`:
- `maxAmountPerRequest` (z.number().min(0))
- `paymentDeadline` (z.number().int().min(1))
- `approvalThreshold` (z.number().min(0))
- `financeOfficer` (z.string()) — was missing from VALID_KEYS despite being used

### src/app/(admin)/admin/config/page.tsx (modified)
- Added `maxAmountPerRequest` and `approvalThreshold` state variables.
- Config load effect hydrates both from fetched config.
- `handleSaveLimits()` saves both keys in parallel.
- New "Spending Limits" UI section with two number inputs and descriptive helper text.

### src/app/(employee)/employee/requests/page.tsx (modified)
Fixed shape bug: `configs.submissionDeadline?.day` replaced with `typeof configs.submissionDeadline === "number"` check.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Auto-approve skips all approval steps | Finance Officer payment flow is separate; approval steps would be incorrect for auto-approved requests |
| approvalThreshold=0 disables auto-approve | 0 is the zero-value default; explicit opt-in required |
| submissionDeadline is a bare number | Config page was already reading it as `typeof === number`; old extraction code `{ day?: number }` was wrong |
| Submitter resolution before config block | Need costCenterId to make CC-scoped config calls |
| Details array response (not single string) | LMIT-05: allows UI to display multiple validation errors |

## Verification Results

```
grep -c "maxAmountPerRequest|paymentDeadline|approvalThreshold" src/app/api/admin/config/route.ts
→ 6 (in VALID_KEYS + valueSchemas)

grep -c "getConfig" src/app/api/requests/route.ts
→ 8 (one per config key + committee lookup)

grep "adminConfig.findMany()" src/app/api/requests/route.ts
→ (no output — correctly removed)

npx vitest run src/lib/__tests__/submission-limits.test.ts
→ 16/16 passing
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Key] financeOfficer missing from VALID_KEYS**
- **Found during:** Task 2 (while extending VALID_KEYS)
- **Issue:** `financeOfficer` key was used by Phase 2 plan but was absent from VALID_KEYS, causing any PUT to /api/admin/config with key=financeOfficer to return 400.
- **Fix:** Added `financeOfficer: z.string()` to both VALID_KEYS and valueSchemas.
- **Files modified:** src/app/api/admin/config/route.ts
- **Commit:** 329a7ca

## Self-Check: PASSED

All created files exist. All 3 task commits verified in git log.
