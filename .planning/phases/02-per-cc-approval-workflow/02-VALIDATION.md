---
phase: 2
slug: per-cc-approval-workflow
status: draft
nyquist_compliant: true
wave_0_complete: false
# wave_0_complete is set to true after Plan 02-01 Task 1 executes.
# Plan 02-01 Task 1 IS the Wave 0 task — it creates src/lib/__tests__/approval-routing.test.ts
# before any implementation runs, satisfying the Nyquist requirement for that file.
created: 2026-05-13
---

# Phase 2 — Validation Strategy

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
| 2-01-01 | 01 | 0 | APPR-01 | unit | `npm test -- --run src/lib/__tests__/approval-routing.test.ts` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | APPR-01–04 | unit | `npm test -- --run src/lib/__tests__/approval-routing.test.ts` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 1 | APPR-01 | automated | `grep -n "mode" src/app/(admin)/admin/config/page.tsx && grep -n "mode" src/app/api/admin/config/route.ts` | — | ⬜ pending |
| 2-02-01 | 02 | 1 | APPR-05–06 | automated | `grep -r "APPROVER" src/app/api/admin/users --include="*.ts"` | — | ⬜ pending |
| 2-02-02 | 02 | 2 | APPR-07 | unit+tsc | `npm test -- --run src/lib/__tests__/workflow-preview.test.ts && npx tsc --noEmit` | — | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/approval-routing.test.ts` — unit tests for CC-scoped approval routing logic
  - Created by Plan 02-01 Task 1 (the Wave 0 task). Set `wave_0_complete: true` in this file after that task completes.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CC A gets sequential committee, CC B gets parallel | APPR-01 | Requires real DB + submission flow | Submit reimbursement from CC A employee → verify routed to CC A approvers only |
| Finance Officer assignment saved per CC | APPR-05 | UI interaction | Select CC, assign Finance Officer, switch CC, verify different FO |
| Workflow preview shows correct CC name | APPR-07 | UI visual | Config page shows "Approval flow for [CC Name]: Employee → Approver → Finance" |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [ ] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
