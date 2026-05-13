---
phase: 3
slug: per-cc-policies-deadlines
status: draft
nyquist_compliant: true
wave_0_complete: false
# wave_0_complete is set to true after Plan 03-01 Task 1 executes.
# Plan 03-01 Task 1 IS the Wave 0 task — it creates src/lib/__tests__/submission-limits.test.ts
# before any implementation runs, satisfying the Nyquist requirement for that file.
created: 2026-05-13
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing) |
| **Quick run command** | `npm test -- --run src/lib/__tests__/` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run src/lib/__tests__/`
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 0 | LMIT-01–05 | unit | `npm test -- --run src/lib/__tests__/submission-limits.test.ts` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | LMIT-01–04 | unit | `npm test -- --run src/lib/__tests__/submission-limits.test.ts` | ❌ W0 | ⬜ pending |
| 3-01-03 | 01 | 1 | LMIT-05 | unit+automated | `npm test -- --run src/lib/__tests__/submission-limits.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 1 | DEAD-01–03 | automated | `grep -n "paymentDeadline\|submissionDeadline\|approvalDeadline" src/app/api/admin/config/route.ts` | — | ⬜ pending |
| 3-02-02 | 02 | 2 | DEAD-04 | manual | see manual table | — | ⬜ pending |
| 3-02-03 | 02 | 2 | DEAD-05 | automated | `grep -n "isOverdue\|overdue" src/app/api/admin` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/submission-limits.test.ts` — unit tests for `validateSubmission()` limit helper and `isOverduePayment()` helper
  - Created by Plan 03-01 Task 1 (the Wave 0 task). Set `wave_0_complete: true` in this file after that task completes.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Employees see deadline status on requests | DEAD-04 | UI visual, requires real DB state | Submit reimbursement → employee dashboard shows time remaining until submission deadline |
| Overdue reimbursements flagged in admin view | DEAD-05 | Requires time-sensitive DB state | Admin view shows overdue badge on reimbursements past payment deadline |
| CC A deadline 25th, CC B deadline 15th | DEAD-01 | Requires two real CC configs | Set different submission deadlines per CC, verify each CC shows its own deadline |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [ ] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
