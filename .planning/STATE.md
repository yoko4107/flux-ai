# PROJECT STATE: System Configuration — Cost Center Admin Panel

**Project:** Cost Center Admin Panel (System Configuration)  
**Current Date:** 2026-05-13  
**Status:** Phase 1 In Progress — Plan 01 Complete

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

**Phase:** Phase 1 — Cost Center Config Scoping (Plan 01/02 complete)  
**Milestone:** System Configuration v1  
**Progress:** 2/46 requirements implemented (NAV-01, NAV-02)

```
Roadmap: ████████████████████████ 100% (structure complete)
Phase 1:  ████████████· · · · · · 50% (1/2 plans done)
```

---

## Phase Status

| Phase | Name | Requirements | Status | Est. Plans |
|-------|------|--------------|--------|-----------|
| 1 | Foundation | 4 | In Progress (1/2 plans) | 2 |
| 2 | Approval Workflows | 7 | Not started | 1 |
| 3 | Spending Policies | 5 | Not started | 1 |
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

1. Execute Plan 02: UI CC Selector — Add cost center dropdown to /admin/config, wire re-fetch and saves to selected CC
2. After Phase 1 complete: proceed to Phase 2 (Per-CC Approval Workflow)

---

## Session Continuity

**Last Updated:** 2026-05-13 (Plan 01 execution)  
**Last Editor:** Claude (executor)  
**Stopped At:** Completed 01-cost-center-config-scoping 01-api-extension-PLAN.md  
**Branch:** claude/dreamy-jones-22d72f  
**Mode:** yolo (with plan_check, verifier, nyquist_validation workflows enabled)

---

*State initialized: 2026-05-13*
