# ROADMAP: System Configuration — Cost Center Admin Panel

**Created:** 2026-05-13  
**Revised:** 2026-05-13 after codebase audit — focused on gaps only, not rebuilding existing features  
**Granularity:** Standard (5-8 phases)  
**Total Requirements:** 46 v1 requirements  
**Coverage:** 46/46 mapped (100%)

---

## Codebase Audit Summary

**Already built (do not rebuild):**
- `/admin/config` — approval committee, deadlines, category limits, notifications (all org-wide)
- `/admin/cost-centers` — CRUD, per-CC currency, country code, employee assignment
- `/admin/per-diem` — per-country rates, high-cost cities, per-CC overrides
- `/admin/payroll` — payroll components, brackets, formulas, per-CC scoping
- `/admin/branding` — org base currency, logo, company name
- Role promotion (EMPLOYEE→APPROVER/FINANCE) exists in `/admin/config`
- `AdminConfig` model supports `costCenterId` — DB layer ready for per-CC scoping

**Key gap:** `/admin/config` is currently org-wide. All config (approval, deadlines, categories) must be scoped per cost center. This is the foundation of all phases.

---

## Phases

- [x] **Phase 1: Cost Center Config Scoping** — Add CC selector to config page; wire all settings to per-CC (completed 2026-05-13)
- [x] **Phase 2: Per-CC Approval Workflow** — Fix approval routing bugs (plan 01 done); finance officer + preview TBD (plan 02)
- [~] **Phase 3: Per-CC Policies & Deadlines** — Limit enforcement done (plan 01); deadline UI TBD (plan 02)
- [x] **Phase 4: Custom Expense Categories** — Free-text custom categories added to AdminConfig JSON (completed 2026-05-14)
- [ ] **Phase 5: Validation & Polish** — Unsaved-changes warning, validation, preview, enforcement check

**Cut (deferred to v2):**
- ~~Phase 5: Per-CC Role Management~~ — Global roles sufficient for v1; CostCenterRole table deferred
- ~~Phase 6: Currency & FX Rate Config~~ — CC currency already set; live rates sufficient for v1
- ~~Phase 7: Regional Rules inline~~ — Per-diem page exists; link-out sufficient for v1
- ~~Phase 8 escalation config~~ — Merged into Phase 5 as validation only; escalation timeout hardcoded

---

## Phase Details

### Phase 1: Cost Center Config Scoping
**Goal:** Admin can select a cost center and all configuration sections scope to that cost center.

**What already exists:** `/admin/config` page with all sections built (approval, deadlines, categories). `AdminConfig.costCenterId` field exists in DB. Cost center list at `/admin/cost-centers`.

**What to build:**
- Cost center selector (dropdown/tabs) at top of `/admin/config`
- All config reads/writes use selected `costCenterId`
- Fallback to org-wide config when no CC-specific override exists
- Visual indicator showing which CC is currently being configured

**Depends on:** Nothing (foundation phase)
**Requirements:** NAV-01, NAV-02, NAV-03, NAV-04
**Note:** APPR-01 (per-CC mode selection UI) was also satisfied in Phase 1 — the CC selector and costCenterId-scoped saves mean approval committee mode is already stored per CC.
**Success Criteria:**
1. Admin sees a cost center selector at the top of the config page
2. Selecting a CC loads that CC's config (or org-wide defaults if none set)
3. Saving config writes to selected CC, not overwriting org-wide
4. Active CC selection is always visible while configuring

**Plans:** 2/2 plans complete
Plans:
- [x] 01-api-extension-PLAN.md — Extend GET/PUT /api/admin/config to accept costCenterId with fallback merge and CC ownership validation
- [ ] 02-ui-cc-selector-PLAN.md — Add CC selector to /admin/config page, wire re-fetch and saves to selected CC

---

### Phase 2: Per-CC Approval Workflow
**Goal:** Approval committee (approvers, mode) is independently configurable per cost center.

**What already exists:** Full approval committee UI built (sequential/parallel toggle, approver add/remove/reorder). Stores in `AdminConfig` key `approvalCommittee`.

**What to build:**
- After Phase 1: verify approval committee reads/writes with `costCenterId` correctly
- Each CC can have different approvers and different sequential/parallel mode
- Finance Officer assignment also scoped per CC
- Approval routing on reimbursement submission uses submitter's CC config (not org-wide)

**Depends on:** Phase 1
**Requirements:** APPR-01, APPR-02, APPR-03, APPR-04, APPR-05, APPR-06, APPR-07
**Note:** APPR-01 satisfied in Phase 1 (mode selection UI already per-CC via costCenterId scoping). Phase 2 completes APPR-01 end-to-end by fixing the submission routing path to honor the per-CC mode.
**Success Criteria:**
1. CC A can have sequential approval with Approver A+B; CC B can have parallel with Approver C only
2. Finance Officer can be different per CC
3. Reimbursement approval routing reads the submitter's CC config
4. Approval workflow preview shows "This applies to [CC Name]"

**Plans:** 2/2 plans complete
Plans:
- [ ] 02-01-fix-approval-routing-PLAN.md — Fix POST /api/requests to use CC-scoped committee; fix approvers[] shape mismatch; fix parallel notification
- [ ] 02-02-finance-officer-preview-PLAN.md — Add financeOfficer AdminConfig key per CC; Finance Officer select UI; WorkflowPreviewCard

---

### Phase 3: Per-CC Policies & Deadlines
**Goal:** Spending limits and deadline policies are configurable independently per cost center.

**What already exists:** `submissionDeadline` and `approvalDeadline` in `AdminConfig` (org-wide). Category max amounts in `AdminConfig` as JSON. Receipt threshold configurable.

**What to build:**
- Verify deadlines and limits read with `costCenterId` after Phase 1
- Add overall reimbursement limit per request (not just per category)
- Add payment deadline (Finance Officer must pay by X — currently only submission+approval deadlines exist)
- System enforcement: validate limits at submission time, flag overdue reimbursements
- Deadline status shown to employees (time remaining indicator)

**Depends on:** Phase 1
**Requirements:** LMIT-01, LMIT-02, LMIT-03, LMIT-04, LMIT-05, DEAD-01, DEAD-02, DEAD-03, DEAD-04, DEAD-05
**Success Criteria:**
1. CC A submission deadline on 25th, CC B on 15th — each independent
2. Overall per-request limit enforced at submission (not just category limits)
3. Payment deadline field added for Finance Officer
4. Employees see deadline status on their reimbursement dashboard
5. Overdue reimbursements flagged in admin view

**Plans:** 2/2 plans complete
Plans:
- [x] 03-01-limit-enforcement-PLAN.md — Wave 0 test stubs + validateSubmission helper + fix CC-scoped config in POST /api/requests + new VALID_KEYS (maxAmountPerRequest, approvalThreshold) + admin UI fields
- [ ] 03-02-deadline-ui-PLAN.md — paymentDeadline admin UI field + public config CC scope fix + employee request deadline status + overdue payments admin dashboard section

---

### Phase 4: Custom Expense Categories
**Goal:** Admin can create, edit, and delete custom expense categories per cost center.

**What already exists:** 12 hardcoded categories as Prisma `Category` enum. Enable/disable toggle and max-amount per category in `AdminConfig`.

**What to build:**
- Migrate `Category` enum → `ExpenseCategory` table (id, orgId, costCenterId, name, code, maxAmount, enabled, isDefault)
- Seed 12 defaults as rows so existing data isn't broken
- Admin CRUD UI: add, rename, set limit, enable/disable, delete (if no reimbursements reference it)
- Reimbursement submission reads dynamic categories from DB instead of enum
- Data migration for existing reimbursements referencing enum values

**Depends on:** Phase 1
**Requirements:** CATG-01, CATG-02, CATG-03, CATG-04, CATG-05, CATG-06
**Success Criteria:**
1. Admin adds "Conference Fees" as a custom category for their CC
2. Admin renames "SUPPLIES" to "Office Supplies"
3. Admin disables "ENTERTAINMENT" — employees can't submit under it
4. Admin sets $200 limit on "Meals" category
5. Existing reimbursements with enum categories display correctly post-migration

**Plans:** 2/2 plans complete
Plans:
- [ ] 04-01-backend-PLAN.md — Wave 0 test stubs + mergeCategories helper + customCategories VALID_KEYS/schema + public config update + POST /api/requests custom category support
- [ ] 04-02-admin-ui-PLAN.md — Custom Categories SectionCard in /admin/config with add/rename/toggle/remove per CC

---

### Phase 5: Validation & Polish
**Goal:** Config saves are validated, enforcement is verified end-to-end, and unsaved-changes UX is complete.

**What already exists:** Save buttons per section, basic toasts on save. Approval routing enforced in submission flow. All CC-scoped config reads/writes working.

**What to build:**
- Unsaved changes indicator + warning on navigation away from config page
- Config validation — block save if approval committee is empty, show clear error
- End-to-end enforcement check: verify CC limits, approvers, deadlines, and custom categories all apply correctly on submission
- Config preview already built (WorkflowPreviewCard) — verify it reflects current CC state

**Depends on:** Phases 1–4
**Requirements:** CONF-01, CONF-02, CONF-04, CONF-05, ENFC-01
**Success Criteria:**
1. "Unsaved changes" indicator visible when user edits config without saving
2. Navigating away with unsaved changes shows confirmation dialog
3. Saving with no approvers shows validation error
4. End-to-end submission enforces CC limits, CC approvers, CC deadlines

**Plans:** 1 plan
Plans:
- [ ] 05-01-validation-polish-PLAN.md — Unsaved changes UX + config validation + E2E enforcement check

---

**Cut (deferred to v2):**
- ~~Phase 5 (original): Per-CC Role Management~~ — Global roles sufficient for v1; CostCenterRole table deferred
- ~~Phase 6: Currency & FX Rate Config~~ — CC currency already set; live rates sufficient for v1
- ~~Phase 7: Regional Rules inline~~ — Per-diem page exists; link-out sufficient for v1
- ~~Phase 8: Escalation config~~ — Escalation timeout hardcoded for v1

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Cost Center Config Scoping | 2/2 | Complete    | 2026-05-13 |
| 2. Per-CC Approval Workflow | 2/2 | Complete   | 2026-05-13 |
| 3. Per-CC Policies & Deadlines | 2/2 | Complete   | 2026-05-13 |
| 4. Custom Expense Categories | 2/2 | Complete   | 2026-05-14 |
| 5. Validation & Polish | 0/1 | Not started | — |

---

## Requirement Mapping Summary

| Phase | Count | Requirements |
|-------|-------|--------------|
| 1. Cost Center Config Scoping | 4 | NAV-01, NAV-02, NAV-03, NAV-04 |
| 2. Per-CC Approval Workflow | 7 | APPR-01–07 |
| 3. Per-CC Policies & Deadlines | 10 | LMIT-01–05, DEAD-01–05 |
| 4. Custom Expense Categories | 3 | CATG-01, CATG-02, CATG-03 |
| 5. Validation & Polish | 5 | CONF-01, CONF-02, CONF-04, CONF-05, ENFC-01 |

**v1 active: 29 requirements | Deferred to v2: CATG-04–06, ROLE-01–06, CURR-01–04, REGN-01–05, CONF-03, ENFC-02–06**

---

*Roadmap created: 2026-05-13*  
*Revised: 2026-05-13 after codebase audit — gaps-only approach, no rebuilding existing features*
