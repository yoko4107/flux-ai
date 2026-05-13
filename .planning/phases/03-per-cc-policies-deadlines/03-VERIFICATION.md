---
phase: 03-per-cc-policies-deadlines
verified: 2026-05-13T17:26:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 3: Per-CC Policies & Deadlines Verification Report

**Phase Goal:** Spending limits and deadline policies are configurable independently per cost center.
**Verified:** 2026-05-13T17:26:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Submitting a request over maxAmountPerRequest returns 400 with details array | VERIFIED | `validateSubmission` called in `requests/route.ts:108`; returns `{ error, details: errors }` at line 117 when errors.length > 0 |
| 2 | Submitting a request under approvalThreshold auto-approves without creating approval steps | VERIFIED | `shouldAutoApprove` called at line 164 of `requests/route.ts`; returns early with APPROVED status before approval step creation block |
| 3 | Config enforcement at submission uses the submitter's CC config, not org-wide rows | VERIFIED | Six parallel `getConfig(prisma, key, orgId, submitterCCId)` calls at lines 91–98 of `requests/route.ts`; no bare `findMany` in hot path |
| 4 | Admin can save maxAmountPerRequest and approvalThreshold from the config UI | VERIFIED | State vars at lines 368–369 of `config/page.tsx`; saved via `saveConfig` at lines 581–582; input fields at lines 909–928 |
| 5 | Admin can configure paymentDeadline per cost center from the Deadlines section | VERIFIED | State var at line 351; save at line 555; input field at line 824–830 of `config/page.tsx` |
| 6 | Admin dashboard shows overdue APPROVED requests that have passed their payment deadline | VERIFIED | `overduePayments` computed at line 104 of `admin/page.tsx`; stat card at line 183; list section at line 286–322 |
| 7 | Employee sees approval and payment deadline status on the individual request detail page | VERIFIED | `approvalDeadlineDays`/`paymentDeadlineDays` state vars at lines 146–147 of `[id]/page.tsx`; fetched from `/api/config/public`; IIFE banners rendered at lines 786 and 803 |
| 8 | Public config endpoint returns approvalDeadline and paymentDeadline CC-scoped to the caller | VERIFIED | `getConfig` called 6 times in `config/public/route.ts`; response object includes `approvalDeadline` and `paymentDeadline` at lines 40–41 |
| 9 | All 16 unit tests for validateSubmission/shouldAutoApprove/isOverduePayment pass | VERIFIED | `npx vitest run src/lib/__tests__/submission-limits.test.ts` → 16 passed (16) |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/submission-limits.ts` | Pure validateSubmission, shouldAutoApprove, isOverduePayment helpers | VERIFIED | 107 lines; exports all three functions; DB-free; SubmissionConfig interface defined |
| `src/lib/__tests__/submission-limits.test.ts` | 16 passing unit tests | VERIFIED | 132 lines; 16 tests across 3 describe blocks; all pass |
| `src/app/api/admin/config/route.ts` | maxAmountPerRequest, paymentDeadline, approvalThreshold in VALID_KEYS + valueSchemas | VERIFIED | All three keys at lines 18–20 in VALID_KEYS; schemas at lines 40–42 in valueSchemas |
| `src/app/api/requests/route.ts` | CC-scoped getConfig calls replacing bare findMany, validateSubmission wired, auto-approve | VERIFIED | getConfig used 7 times; validateSubmission at line 108; shouldAutoApprove at line 164; no bare findMany in hot path |
| `src/app/(admin)/admin/config/page.tsx` | maxAmountPerRequest + approvalThreshold + paymentDeadline inputs with save/load | VERIFIED | All three state vars, load effects, save calls, and input fields present |
| `src/app/(admin)/admin/page.tsx` | Overdue payments section with APPROVED requests past paymentDeadline | VERIFIED | overduePayments computed, stat card, and list section rendered; uses addBusinessDays with updatedAt proxy |
| `src/app/(employee)/employee/requests/[id]/page.tsx` | Deadline status banners for approval (SUBMITTED) and payment (APPROVED) states | VERIFIED | approvalDeadlineDays + paymentDeadlineDays fetched from /api/config/public; IIFE banners at lines 786 and 803 |
| `src/app/api/config/public/route.ts` | CC-scoped, returns approvalDeadline + paymentDeadline | VERIFIED | Rewritten with getConfig() resolving user's orgId + ccId; both fields in response object |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/app/api/requests/route.ts` | `src/lib/config.ts` | `getConfig(prisma, key, orgId, ccId)` | WIRED | Import at line 11; used 6 times for config keys + 1 in resolveCommittee |
| `src/app/api/requests/route.ts` | `src/lib/submission-limits.ts` | `validateSubmission(amount, category, ...)` | WIRED | Import at line 12; called at line 108; result checked and returns 400 if errors |
| `src/app/api/requests/route.ts` | `src/lib/submission-limits.ts` | `shouldAutoApprove(amount, approvalThreshold)` | WIRED | Same import; called at line 164; early return with APPROVED status before approval steps |
| `src/app/(admin)/admin/page.tsx` | `prisma.reimbursementRequest` | Query APPROVED requests, filter by paymentDeadline + updatedAt | WIRED | `findMany({ where: { status: "APPROVED" } })` at lines 75–87; `overduePayments` filter at line 104 |
| `src/app/(employee)/employee/requests/[id]/page.tsx` | `/api/config/public` | `fetch` in useEffect to read approvalDeadline + paymentDeadline | WIRED | fetch at line 170; setApprovalDeadlineDays at line 173; setPaymentDeadlineDays at line 174; used in IIFE banners |
| `src/app/api/config/public/route.ts` | `src/lib/config.ts` | `getConfig(prisma, key, orgId, ccId)` | WIRED | Import at line 5; 6 parallel getConfig calls at lines 27–33; user's ccId resolved at lines 16–21 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| LMIT-01 | 03-01 | Admin can set overall reimbursement limit per request | SATISFIED | `maxAmountPerRequest` in VALID_KEYS, config UI input, enforced via `validateSubmission` |
| LMIT-02 | 03-01 | Admin can set approval threshold (small requests auto-approve) | SATISFIED | `approvalThreshold` in VALID_KEYS, config UI input, auto-approve via `shouldAutoApprove` in requests route |
| LMIT-03 | 03-01 | Admin can set per-category spending limits | SATISFIED | `maxAmountPerCategory` already in VALID_KEYS; `validateSubmission` enforces per-category limits |
| LMIT-04 | 03-01 | Reimbursement system enforces limits when employee submits | SATISFIED | `validateSubmission` called in POST /api/requests before request creation; returns 400 on violation |
| LMIT-05 | 03-01 | System prevents submission over limit or flags for review | SATISFIED | Returns `{ error: "Validation failed", details: string[] }` — details array carries multiple errors |
| DEAD-01 | 03-02 | Admin can set reimbursement submission deadline | SATISFIED | `submissionDeadline` in VALID_KEYS (pre-existing); config page has input + save; `validateSubmission` checks it |
| DEAD-02 | 03-02 | Admin can set approval deadline (when approvers must act) | SATISFIED | `approvalDeadline` in VALID_KEYS (pre-existing); config page has input + save; admin dashboard uses it for overdueSteps |
| DEAD-03 | 03-02 | Admin can set payment deadline (when Finance Officer pays) | SATISFIED | `paymentDeadline` added to VALID_KEYS in 03-01; config page input + save added in 03-02 |
| DEAD-04 | 03-02 | System shows deadline status to employees | SATISFIED | Employee `[id]/page.tsx` fetches from `/api/config/public`; renders approval/payment deadline banners |
| DEAD-05 | 03-02 | System flags overdue reimbursements for admin attention | SATISFIED | Admin dashboard `overduePayments` section shows APPROVED requests past paymentDeadline; stat card + list |

All 10 requirement IDs from Phase 3 plans (LMIT-01 to LMIT-05, DEAD-01 to DEAD-05) are accounted for with implementation evidence.

---

### Anti-Patterns Found

No blocker anti-patterns found.

Notable items (informational only):

| File | Issue | Severity | Impact |
|------|-------|----------|--------|
| `src/app/(admin)/admin/page.tsx` | `isOverduePayment` helper from `submission-limits.ts` is NOT used — admin page has its own inline `addBusinessDays` and computes overdue inline | Info | Intentional per SUMMARY (plan 03-02 decision: avoids cross-module import from server component); logic is equivalent and correct |
| `src/app/(employee)/employee/requests/[id]/page.tsx` | Same — local `addBusinessDays` duplicated rather than imported from `submission-limits.ts` | Info | Same rationale; functionally correct |

---

### Human Verification Required

#### 1. Multi-error display in submission rejection UI

**Test:** Submit a request with an amount over maxAmountPerRequest AND a disallowed category. Both errors should be returned simultaneously.
**Expected:** UI displays multiple validation error messages from the `details` array, not just the first one.
**Why human:** Cannot verify how the employee request form renders the `details[]` array response without running the app.

#### 2. Deadline banners visual appearance on employee request detail

**Test:** With an active `approvalDeadline` configured, view a SUBMITTED request's detail page.
**Expected:** An amber "Approval due by [date]" or red "Approval overdue by N days" banner appears above the approval steps timeline.
**Why human:** IIFE rendering pattern (lines 786/803) verified in code, but visual rendering and correct date formatting require runtime observation.

#### 3. Overdue payments list in admin dashboard

**Test:** With `paymentDeadline = 1` configured, and at least one APPROVED request older than 1 business day, view the admin dashboard.
**Expected:** The "Overdue Payments" stat card shows a count > 0 and the list section shows request rows with employee name, cost center, amount, and days overdue.
**Why human:** Requires live database with seeded APPROVED requests.

---

### Gaps Summary

No gaps. All 9 observable truths verified. All 10 requirement IDs satisfied with direct code evidence. Key links are wired end-to-end. No blocker anti-patterns.

The admin page's use of an inline `addBusinessDays` helper rather than the shared `isOverduePayment` from `submission-limits.ts` is intentional (documented in SUMMARY 03-02) and does not affect correctness — the business-day logic is identical in both implementations.

---

_Verified: 2026-05-13T17:26:00Z_
_Verifier: Claude (gsd-verifier)_
