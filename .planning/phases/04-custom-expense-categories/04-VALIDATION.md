---
phase: 4
slug: custom-expense-categories
status: draft
nyquist_compliant: true
wave_0_complete: false
# wave_0_complete is set to true after Plan 04-01 Task 1 executes.
# Plan 04-01 Task 1 IS the Wave 0 task — it creates src/lib/__tests__/custom-categories.test.ts
# before any implementation runs, satisfying the Nyquist requirement for that file.
created: 2026-05-14
---

# Phase 4 — Validation Strategy

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
| 4-01-01 | 01 | 0 | CATG-01–03 | unit | `npm test -- --run src/lib/__tests__/custom-categories.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | CATG-01–03 | unit | `npm test -- --run src/lib/__tests__/custom-categories.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 1 | CATG-01–03 | automated | `grep -n "customCategories" src/app/api/admin/config/route.ts` | — | ⬜ pending |
| 4-02-01 | 02 | 2 | CATG-01–03 | automated | `npx tsc --noEmit 2>&1 \| grep "custom-categories\|admin/config"` | — | ⬜ pending |
| 4-02-02 | 02 | 2 | CATG-02–03 | manual | see manual table | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/custom-categories.test.ts` — unit tests for `mergeCategories()` helper (defaults + custom, enabled filter, dedup)
  - Created by Plan 04-01 Task 1 (the Wave 0 task). Set `wave_0_complete: true` in this file after that task completes.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin adds "Conference Fees" custom category | CATG-02 | UI interaction | Go to /admin/config, add custom category, verify it appears in list |
| Admin renames custom category | CATG-03 | UI interaction | Edit existing custom category name, save, verify persisted |
| Admin disables a default category | CATG-03 | UI interaction | Toggle off "ENTERTAINMENT", verify it no longer appears in employee submission form |
| Employee sees custom categories in submission form | CATG-01 | Requires real DB + user session | Submit reimbursement, verify custom categories appear in dropdown |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [ ] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
