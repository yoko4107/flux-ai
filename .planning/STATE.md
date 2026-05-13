---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
stopped_at: Completed 03-per-cc-policies-deadlines 03-02-deadline-ui-PLAN.md
last_updated: "2026-05-13T10:22:54.733Z"
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 6
  completed_plans: 6
  percent: 100
---

# PROJECT STATE: System Configuration — Cost Center Admin Panel

**Project:** Cost Center Admin Panel (System Configuration)  
**Current Date:** 2026-05-13  
**Status:** Ready to plan

---

## Project Reference

**Core Value:**
Admins can configure all reimbursement rules per cost center without technical support—approval workflows, limits, categories, regional rules, deadlines, and role assignments are fully configurable and immediately enforced in the system.

**Scope:** 46 v1 requirements across 8 phases
- **Tech Stack:** Next.js + TypeScript, Prisma ORM
- **Context:** Extension to existing Ringkas reimbursement app
- **Timeline:** Standard granularity (5-8 phases, 1-2 weeks per phase typical)

---

## Current Position

**Phase:** Phase 3 — Per-CC Policies & Deadlines (2/2 plans complete)  
**Milestone:** System Configuration v1  
**Progress:** [██████████] 100%

```
Roadmap: ████████████████████████ 100% (structure complete)
Phase 1:  ████████████████████████ 100% (2/2 plans done)
Phase 2:  ████████████████████████ 100% (2/2 plans done)
Phase 3:  ████████████████████████ 100% (2/2 plans done)
```

---

## Phase Status

| Phase | Name | Requirements | Status | Est. Plans |
|-------|------|--------------|--------|-----------|
| 1 | Foundation | 4 | Complete (2/2 plans) | 2 |
| 2 | Approval Workflows | 7 | Complete (2/2 plans) | 2 |
| 3 | Per-CC Policies & Deadlines | 10 | Complete (2/2 plans) | 2 |
| 4 | Expense Categories | 6 | Not started | 1 |
| 5 | Role Management | 6 | Not started | 1 |
| 6 | Regional Rules | 5 | Not started | 1 |
| 7 | Deadlines | 5 | Not started | 1 |
| 8 | Currency & Finalization | 15 | Not started | 1 |

---

## Key Decisions

| Decision | Status | Impact |
|----------|--------|--------|
| Cost center-based config (not org-wide) | Locked | ✓ Clear scope boundary |
| Sequential or Parallel approval modes only | Locked | ✓ Simplifies workflow logic |
| Config enforced at submission/approval time | Locked | ✓ Admins control workflow |
| No approval delegation (v2) | Locked | ✓ Reduces complexity |
| No real-time notifications (v2) | Locked | ✓ Email triggers sufficient |
| No audit logging beyond git (v2) | Locked | ✓ Standard commits adequate |
| Map-based merge in mergeConfigs (orgRows first, ccRows overwrite) | Locked | ✓ O(n+m), last-write-wins |
| null costCenterId always valid (sentinel {id:''}) | Locked | ✓ No DB query for org-wide paths |
| (ccId ?? null) as unknown as string for Prisma compound key | Locked | ✓ Required by Prisma null cast |
| Shared CostCenterSelector at src/components/admin/ — additive, payroll original unchanged | Locked | ✓ No breaking changes to existing pages |
| Two separate useEffects: CC list (mount-only), config (selectedCC?.id dep) | Locked | ✓ Prevents config fetch before CCs arrive |
| costCenterId passed at saveConfig call time — not captured in closure | Locked | ✓ Avoids stale null before CC loads |
| Extract resolveCommittee/buildApprovalSteps/selectNotifyTargets as pure helpers | Locked | ✓ Unit testable without DB connection |
| Remove filterCommitteeForRequester — per-CC getConfig resolution replaces it | Locked | ✓ Simpler, correct CC scoping |
| derivePreviewSteps extracted as pure helper in workflow-preview-helpers.ts | Locked | ✓ Testable without React renderer |
| Config API GET/PUT extended with costCenterId param | Locked | ✓ Required for CC-scoped financeOfficer storage |
| financeOfficer key in AdminConfig VALID_KEYS + Zod schema | Locked | ✓ Accepts per-CC finance officer designation |
| Auto-approve skips approval steps entirely — returns 201 APPROVED | Locked | ✓ Finance Officer payment flow is separate |
| approvalThreshold=0 disables auto-approve (explicit opt-in) | Locked | ✓ Zero-value default is safe |
| submissionDeadline stored as bare number (not {day: number}) | Locked | ✓ Fixes shape bug across all callers |
| validateSubmission returns string[] details array | Locked | ✓ LMIT-05: UI can show multiple errors |
| updatedAt used as approvedAt proxy for payment deadline | Locked | ✓ No dedicated approvedAt field; updatedAt changes on status change |
| Public config endpoint CC-scoped via user.costCenterId+organizationId lookup | Locked | ✓ Returns correct config per employee's CC |

---

## Accumulated Context

### Architecture Notes
- Extend existing Prisma schema (index.ts entry point already added per recent PR 7609d6a)
- Follow cost center management patterns from recent PRs (e.g., PR on payroll rules organization)
- Match existing admin panel UI conventions

### Dependencies Identified
- Phase 1 (Foundation) enables all others
- Phase 2 (Approval Workflows) enables Phase 5 (Role Management)
- Phase 3 (Spending Policies) enables Phase 4 (Expense Categories)
- Phase 8 (Currency & Finalization) depends on all prior phases (final enforcement layer)

### Naming Conventions
- Requirement IDs: NAV, APPR, LMIT, CATG, ROLE, REGN, DEAD, CURR, CONF, ENFC
- Phase: Phase N (integer phases 1-8, no decimal insertions yet)
- Plans: TBD (placeholder until Phase 1 planning)

### Technical Debt & Notes
- Consult node_modules/next/dist/docs/ for Next.js version-specific breaking changes
- Match Prisma patterns from existing cost center relationships
- Ensure TypeScript strict mode compliance throughout

---

## Blockers & Risks

**Current Blockers:** None — roadmap complete, ready for planning

**Identified Risks:**
- Complexity of approval workflow display (sequential vs. parallel preview) — Address in Phase 2 planning
- Currency exchange rate handling (multi-currency logic) — Research needed before Phase 8
- Regional tax rule variability by country — May require lookup service integration

---

## Next Steps

1. Phase 3 complete (LMIT-01 through LMIT-05 all satisfied) — proceed to Phase 4: Expense Categories
2. Phase 4 will add per-CC allowed category management and category-specific rules

---

## Session Continuity

**Last Updated:** 2026-05-13 (Plan 03-01 execution)  
**Last Editor:** Claude (executor)  
**Stopped At:** Completed 03-per-cc-policies-deadlines 03-02-deadline-ui-PLAN.md
**Branch:** claude/dreamy-jones-22d72f  
**Mode:** yolo (with plan_check, verifier, nyquist_validation workflows enabled)

---

*State initialized: 2026-05-13*
