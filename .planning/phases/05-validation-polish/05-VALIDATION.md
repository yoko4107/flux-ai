---
phase: 5
slug: validation-polish
status: draft
nyquist_compliant: true
wave_0_complete: true
# No new test files needed — all new behaviors are React component concerns
# that require jsdom (out of scope). Existing 120 tests cover CONF-04 and ENFC-01.
created: 2026-05-14
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite green + manual checklist complete

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 5-01-01 | 01 | 1 | CONF-02 | manual | see manual table | ⬜ pending |
| 5-01-02 | 01 | 1 | CONF-02 | manual | see manual table | ⬜ pending |
| 5-01-03 | 01 | 1 | CONF-05 | manual | see manual table | ⬜ pending |
| 5-01-04 | 01 | 1 | CONF-04 | automated | `npm test -- --grep "derivePreviewSteps"` | ⬜ pending |
| 5-01-05 | 01 | 1 | ENFC-01 | automated | `npm test -- --grep "sequential\|parallel\|CC lookup"` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

**None.** No new test files are needed for Phase 5. The new behaviors (dirty tracking, beforeunload, inline validation) are all React component concerns that require a browser environment (jsdom). Adding jsdom is out of scope. Existing pure-helper tests cover CONF-04 and ENFC-01 at the unit level.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Unsaved changes banner appears after field edit | CONF-02 | React client state — no jsdom | Edit committee mode on /admin/config → amber banner appears |
| beforeunload fires when dirty | CONF-02 | Browser behavior | Edit a field, close tab / refresh → browser prompts to confirm |
| Discard button resets fields to last loaded state | CONF-02 | React client state | Edit a field, click "Discard" → fields reset to saved values |
| Save blocked when approvers empty | CONF-05 | React client state | Remove all approvers, click Save → inline error appears, no API call |
| WorkflowPreviewCard updates live | CONF-04 | React rendering | Add/remove approver → preview card updates immediately |
| Sequential submit: only step-0 approver notified | ENFC-01 | Requires real DB session | Submit request to CC with sequential 2-approver committee → only first notified |
| Parallel submit: all approvers notified | ENFC-01 | Requires real DB session | Submit request to CC with parallel committee → all notified |

---

## Validation Sign-Off

- [x] All tasks have automated verify or manual verification instructions
- [x] Wave 0 not required (no new pure helpers)
- [x] No watch-mode flags
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
