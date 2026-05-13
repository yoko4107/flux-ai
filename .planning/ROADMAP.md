# ROADMAP: System Configuration — Cost Center Admin Panel

**Created:** 2026-05-13  
**Granularity:** Standard (5-8 phases)  
**Total Requirements:** 46 v1 requirements  
**Coverage:** 46/46 mapped (100%)

---

## Phases

- [ ] **Phase 1: Foundation** - Cost center navigation and UI structure
- [ ] **Phase 2: Approval Workflows** - Configure sequential or parallel approval chains
- [ ] **Phase 3: Spending Policies** - Set limits and thresholds for reimbursements
- [ ] **Phase 4: Expense Categories** - Manage expense categories and category-specific limits
- [ ] **Phase 5: Role Management** - Assign employees to roles (Approvers, Finance Officer)
- [ ] **Phase 6: Regional Rules** - Configure location-based tax and per-diem policies
- [ ] **Phase 7: Deadlines** - Configure submission, approval, and payment deadlines
- [ ] **Phase 8: Currency & Finalization** - Set currency and finalize configuration enforcement

---

## Phase Details

### Phase 1: Foundation
**Goal:** Admin can navigate and select cost centers to configure  
**Depends on:** Nothing (foundation phase)  
**Requirements:** NAV-01, NAV-02, NAV-03, NAV-04  
**Success Criteria:**
1. Admin views a list of all cost centers they manage
2. Admin can select a cost center and see it highlighted as the current selection
3. Admin can quickly switch between cost centers without losing their place
4. Current cost center is visible at all times during configuration

**Plans:** TBD

---

### Phase 2: Approval Workflows
**Goal:** Admin can configure approval workflow (sequential or parallel) with assigned approvers  
**Depends on:** Phase 1 (cost center selected)  
**Requirements:** APPR-01, APPR-02, APPR-03, APPR-04, APPR-05, APPR-06, APPR-07  
**Success Criteria:**
1. Admin selects approval mode (Sequential or Parallel) and sees the selection persisted
2. Admin adds Approver 1 to the committee (required), with ability to remove
3. Admin adds Approver 2 (optional) with independent add/remove control
4. Admin can promote any employee to Approver 1 or 2 role, and demote them back to Employee
5. Admin sees a workflow preview diagram showing how approvals will flow (sequential chain or parallel branches)

**Plans:** TBD

---

### Phase 3: Spending Policies
**Goal:** Admin can set reimbursement limits and approval thresholds that the system enforces  
**Depends on:** Phase 1 (cost center selected)  
**Requirements:** LMIT-01, LMIT-02, LMIT-03, LMIT-04, LMIT-05  
**Success Criteria:**
1. Admin sets overall reimbursement limit per request (e.g., max $5,000 per submission)
2. Admin sets approval threshold (e.g., requests under $500 auto-approve without Approver 1)
3. Admin sets per-category spending limits (category-specific caps apply in Phase 4)
4. System prevents employee submission over the limit or flags it for review
5. Limits are enforced when employee submits a reimbursement (validation happens at submission time)

**Plans:** TBD

---

### Phase 4: Expense Categories
**Goal:** Admin can view, add, modify, and delete expense categories with category-specific limits  
**Depends on:** Phase 3 (spending policies set)  
**Requirements:** CATG-01, CATG-02, CATG-03, CATG-04, CATG-05, CATG-06  
**Success Criteria:**
1. Admin views default expense categories (Travel, Meals, Office, etc.)
2. Admin adds custom expense category with name and description
3. Admin modifies category name/description and sees changes applied
4. Admin deletes an unused category (not currently in use)
5. Admin sets category-specific spending limits (e.g., "Travel" max $3,000)
6. Employee can only submit expenses in categories enabled for their cost center

**Plans:** TBD

---

### Phase 5: Role Management
**Goal:** Admin can assign employees to roles (Approver 1, Approver 2, Finance Officer, Employee)  
**Depends on:** Phase 1 (cost center selected) and Phase 2 (approvers selected)  
**Requirements:** ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05, ROLE-06  
**Success Criteria:**
1. Admin views all employees in their cost center
2. Admin assigns employee as Approver 1 or Approver 2 (or changes assignment)
3. Admin assigns employee as Finance Officer
4. Admin changes employee role (promote/demote between roles)
5. Admin removes employee from special role (reverts to plain Employee)
6. Employee role restricts what they can do in the system (non-Approvers can't approve, non-Finance Officers can't finalize payments)

**Plans:** TBD

---

### Phase 6: Regional Rules
**Goal:** Admin can configure regional tax, per-diem rules, and enable locations for cost center  
**Depends on:** Phase 1 (cost center selected)  
**Requirements:** REGN-01, REGN-02, REGN-03, REGN-04, REGN-05  
**Success Criteria:**
1. Admin configures regional rules per location (e.g., "New York", "Remote", "Singapore")
2. Admin sets per-diem rates by location (e.g., $150/day in New York)
3. Admin sets tax/deduction rules per region (e.g., Singapore has GST, withholding rules)
4. Admin enables/disables regions for their cost center (only enabled regions are available to employees)
5. System applies regional rules when processing reimbursements from that location

**Plans:** TBD

---

### Phase 7: Deadlines
**Goal:** Admin can configure submission, approval, and payment deadlines  
**Depends on:** Phase 1 (cost center selected)  
**Requirements:** DEAD-01, DEAD-02, DEAD-03, DEAD-04, DEAD-05  
**Success Criteria:**
1. Admin sets reimbursement submission deadline (e.g., "last day of month at 5 PM")
2. Admin sets approval deadline (e.g., "approvers must act within 3 business days")
3. Admin sets payment deadline (e.g., "Finance Officer must pay by 15th of following month")
4. System shows deadline status to employees (time remaining, deadline date, urgency indicator)
5. System flags overdue reimbursements for admin attention (dashboard notification)

**Plans:** TBD

---

### Phase 8: Currency & Finalization
**Goal:** Admin can set currency and finalize configuration with enforcement and preview  
**Depends on:** All prior phases (Phases 1-7)  
**Requirements:** CURR-01, CURR-02, CURR-03, CURR-04, CONF-01, CONF-02, CONF-03, CONF-04, CONF-05, ENFC-01, ENFC-02, ENFC-03, ENFC-04, ENFC-05, ENFC-06  
**Success Criteria:**
1. Admin selects currency for cost center (e.g., USD, SGD, EUR)
2. Admin sets currency exchange rules if multi-currency (conversion rates, rounding)
3. Admin can preview entire configuration before saving (see all settings applied together)
4. Admin can save configuration changes (persists to database) or discard (reverts unsaved changes)
5. Admin can view previous configuration history (audit trail of changes)
6. System shows validation errors if configuration is incomplete or invalid
7. Once saved, system enforces all configured rules: approval routing, spending limits, category limits, role restrictions, regional rules, deadline tracking, and currency display

**Plans:** TBD

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/1 | Not started | — |
| 2. Approval Workflows | 0/1 | Not started | — |
| 3. Spending Policies | 0/1 | Not started | — |
| 4. Expense Categories | 0/1 | Not started | — |
| 5. Role Management | 0/1 | Not started | — |
| 6. Regional Rules | 0/1 | Not started | — |
| 7. Deadlines | 0/1 | Not started | — |
| 8. Currency & Finalization | 0/1 | Not started | — |

---

## Requirement Mapping Summary

| Phase | Count | Requirements |
|-------|-------|--------------|
| 1. Foundation | 4 | NAV-01, NAV-02, NAV-03, NAV-04 |
| 2. Approval Workflows | 7 | APPR-01, APPR-02, APPR-03, APPR-04, APPR-05, APPR-06, APPR-07 |
| 3. Spending Policies | 5 | LMIT-01, LMIT-02, LMIT-03, LMIT-04, LMIT-05 |
| 4. Expense Categories | 6 | CATG-01, CATG-02, CATG-03, CATG-04, CATG-05, CATG-06 |
| 5. Role Management | 6 | ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05, ROLE-06 |
| 6. Regional Rules | 5 | REGN-01, REGN-02, REGN-03, REGN-04, REGN-05 |
| 7. Deadlines | 5 | DEAD-01, DEAD-02, DEAD-03, DEAD-04, DEAD-05 |
| 8. Currency & Finalization | 15 | CURR-01, CURR-02, CURR-03, CURR-04, CONF-01, CONF-02, CONF-03, CONF-04, CONF-05, ENFC-01, ENFC-02, ENFC-03, ENFC-04, ENFC-05, ENFC-06 |

**Total: 46/46 requirements mapped (100%)**

---

*Roadmap created: 2026-05-13*
