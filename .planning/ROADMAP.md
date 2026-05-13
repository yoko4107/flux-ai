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
- [~] **Phase 2: Per-CC Approval Workflow** — Fix approval routing bugs (plan 01 done); finance officer + preview TBD (plan 02)
- [ ] **Phase 3: Per-CC Policies & Deadlines** — Scope spending limits and deadlines per CC
- [ ] **Phase 4: Custom Expense Categories** — Free-text custom categories added to AdminConfig JSON
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

**Plans:** 2 plans
Plans:
- [ ] 01-api-extension-PLAN.md — Extend GET/PUT /api/admin/config to accept costCenterId with fallback merge and CC ownership validation
- [ ] 02-ui-cc-selector-PLAN.md — Add CC selector to /admin/config page, wire re-fetch and saves to selected CC

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

**Plans:** 2 plans
Plans:
- [ ] 01-api-extension-PLAN.md — Extend GET/PUT /api/admin/config to accept costCenterId with fallback merge and CC ownership validation
- [ ] 02-ui-cc-selector-PLAN.md — Add CC selector to /admin/config page, wire re-fetch and saves to selected CC

---

### Phase 5: Per-CC Role Management
**Goal:** Role assignments (Approver, Finance Officer) are scoped per cost center — same employee can have different roles in different CCs.

**What already exists:** Global role promotion (EMPLOYEE→APPROVER/FINANCE) on `User.role`. Cost center member list on `/admin/cost-centers`. Role promotion UI in `/admin/config`.

**What to build:**
- `CostCenterRole` join table (userId, costCenterId, role) for per-CC role assignments
- Update role assignment UI to show roles in context of selected CC
- Update approval routing to check CC-specific role, not global `User.role`
- Finance Officers restricted to seeing only their CC's reimbursements

**Depends on:** Phase 1, Phase 2
**Requirements:** ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05, ROLE-06
**Success Criteria:**
1. Employee can be Approver in CC A, plain Employee in CC B
2. Admin sees employee list with their CC-specific role (not global role)
3. Approval routing uses CC-specific role
4. Finance Officer sees only their CC's reimbursements

**Plans:** 2 plans
Plans:
- [ ] 01-api-extension-PLAN.md — Extend GET/PUT /api/admin/config to accept costCenterId with fallback merge and CC ownership validation
- [ ] 02-ui-cc-selector-PLAN.md — Add CC selector to /admin/config page, wire re-fetch and saves to selected CC

---

### Phase 6: Currency & FX Rate Configuration
**Goal:** Admin can configure currency and set fixed exchange rate overrides per cost center.

**What already exists:** `CostCenter.currency` field (ISO-4217). Org base currency in branding. FX convert API at `/api/fx/convert` and `/api/fx/rate` (config is external/hardcoded). `ReimbursementRequest.exchangeRate` field exists.

**What to build:**
- Admin UI to set fixed FX rate override (e.g., USD→IDR fixed at 15,800)
- Toggle: live FX rates vs. admin-set fixed rate
- Display current effective rate for selected CC
- Reimbursement shown in CC currency, reported in org base currency

**Depends on:** Phase 1
**Requirements:** CURR-01, CURR-02, CURR-03, CURR-04
**Success Criteria:**
1. Admin can lock USD→IDR at 15,800 for their CC
2. Admin can switch CC to use live rates
3. Reimbursement submission shows amount in CC currency
4. Finance summary converts to org base currency

**Plans:** 2 plans
Plans:
- [ ] 01-api-extension-PLAN.md — Extend GET/PUT /api/admin/config to accept costCenterId with fallback merge and CC ownership validation
- [ ] 02-ui-cc-selector-PLAN.md — Add CC selector to /admin/config page, wire re-fetch and saves to selected CC

---

### Phase 7: Regional Rules in Config Context
**Goal:** Per-diem rates and regional tax rules are surfaced inline within the CC config (not only on separate pages).

**What already exists:** `/admin/per-diem` with per-country rates and CC overrides. `CountryPayrollRule` with per-CC tax brackets. Payroll rules at `/admin/payroll`.

**What to build:**
- CC config page: inline summary of applicable per-diem rates for selected CC's country
- Quick-edit per-diem rate for CC without going to separate page
- Meal deduction % config per country (breakfast/lunch/dinner deduction rates — currently missing)
- Link-outs to full `/admin/per-diem` and `/admin/payroll` for deep editing
- System applies CC regional rules when processing reimbursements

**Depends on:** Phase 1
**Requirements:** REGN-01, REGN-02, REGN-03, REGN-04, REGN-05
**Success Criteria:**
1. Admin editing "Singapore CC" sees Singapore per-diem rates inline on config page
2. Admin can set meal deduction percentages (breakfast 10%, lunch 15%, dinner 20%)
3. Regional rules for selected CC are visible in context
4. Reimbursements from that location auto-apply the CC's regional rules

**Plans:** 2 plans
Plans:
- [ ] 01-api-extension-PLAN.md — Extend GET/PUT /api/admin/config to accept costCenterId with fallback merge and CC ownership validation
- [ ] 02-ui-cc-selector-PLAN.md — Add CC selector to /admin/config page, wire re-fetch and saves to selected CC

---

### Phase 8: Config Management & Enforcement
**Goal:** Config saves are validated, enforcement is complete end-to-end, escalation is configurable.

**What already exists:** Save buttons per section, basic toasts on save. Approval routing enforced in submission flow.

**What to build:**
- Unsaved changes indicator ("You have unsaved changes") + warning on navigation
- Config validation — block save if approval committee empty, deadline invalid, etc.
- Config preview — show how reimbursement would route under current config
- Approval escalation config: set timeout (days), set escalation target (next approver, manager, finance)
- Verify end-to-end enforcement: all CC rules applied on submission, routing, and payment

**Depends on:** All prior phases
**Requirements:** CONF-01, CONF-02, CONF-03, CONF-04, CONF-05, ENFC-01, ENFC-02, ENFC-03, ENFC-04, ENFC-05, ENFC-06
**Success Criteria:**
1. "Unsaved changes" badge visible; navigating away shows confirmation dialog
2. Saving with no approvers shows "Approval committee cannot be empty" error
3. Preview shows "Request from Employee X → Approver Y (3 days) → Finance Z"
4. Escalation: unapproved after 5 days auto-escalates to configured target
5. End-to-end: submit → CC limits enforced → CC approvers notified → CC finance processes

**Plans:** 2 plans
Plans:
- [ ] 01-api-extension-PLAN.md — Extend GET/PUT /api/admin/config to accept costCenterId with fallback merge and CC ownership validation
- [ ] 02-ui-cc-selector-PLAN.md — Add CC selector to /admin/config page, wire re-fetch and saves to selected CC

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Cost Center Config Scoping | 2/2 | Complete    | 2026-05-13 |
| 2. Per-CC Approval Workflow | 2/2 | Complete   | 2026-05-13 |
| 3. Per-CC Policies & Deadlines | 0/1 | Not started | — |
| 4. Custom Expense Categories | 0/1 | Not started | — |
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
