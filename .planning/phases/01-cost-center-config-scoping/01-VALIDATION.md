---
phase: 1
slug: cost-center-config-scoping
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-13
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing in project) |
| **Config file** | vitest.config.ts (or package.json scripts) |
| **Quick run command** | `npm test -- --run src/lib/config` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run src/lib/config`
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | NAV-01 | unit | `npm test -- --run src/lib/config` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | NAV-01 | unit | `npm test -- --run src/lib/config` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | NAV-02 | manual | see manual table | — | ⬜ pending |
| 1-01-04 | 01 | 1 | NAV-03 | manual | see manual table | — | ⬜ pending |
| 1-02-01 | 02 | 1 | NAV-02 | manual | see manual table | — | ⬜ pending |
| 1-02-02 | 02 | 1 | NAV-04 | manual | see manual table | — | ⬜ pending |
| 1-02-03 | 02 | 2 | NAV-02 | unit | `npm test -- --run src/lib/config` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/config-merge.test.ts` — unit tests for org-wide→CC fallback merge logic
- [ ] `src/lib/__tests__/config-ownership.test.ts` — unit tests for CC ownership validation in PUT

*Framework already exists — no install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CC selector appears at top of config page | NAV-01 | UI component, no headless test | Load /admin/config, verify dropdown renders with cost center list |
| Selecting CC loads its config | NAV-02 | Requires real DB state with per-CC config rows | Select CC A → verify approval mode, Select CC B → verify different approval mode |
| Active CC indicator always visible | NAV-03 | Visual/layout verification | Scroll down config page — confirm CC name visible in sticky header or breadcrumb |
| Switching CC doesn't lose page position | NAV-04 | UX behavior | Scroll to bottom of config, switch CC, verify page doesn't jump to top |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
