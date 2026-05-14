# Requirements: System Configuration — Cost Center Admin Panel

**Defined:** 2026-05-13
**Core Value:** Admins can configure all reimbursement rules per cost center without technical support

## v1 Requirements

### Cost Center Navigation

- [x] **NAV-01**: Admin can view list of cost centers they manage
- [x] **NAV-02**: Admin can select a cost center to configure
- [x] **NAV-03**: Admin can see which cost center is currently selected at all times
- [x] **NAV-04**: Admin can quickly switch between cost centers

### Approval Workflow Configuration

- [x] **APPR-01**: Admin can select approval mode (Sequential or Parallel)
- [x] **APPR-02**: Admin can add Approver 1 to approval committee
- [x] **APPR-03**: Admin can add Approver 2 to approval committee (optional)
- [x] **APPR-04**: Admin can remove approvers from committee
- [x] **APPR-05**: Admin can promote an employee to Approver role
- [x] **APPR-06**: Admin can demote an approver back to employee role
- [x] **APPR-07**: System displays approval workflow preview (how approvals will flow)

### Spending Limits & Thresholds

- [x] **LMIT-01**: Admin can set overall reimbursement limit per request
- [x] **LMIT-02**: Admin can set approval threshold (small requests auto-approve)
- [x] **LMIT-03**: Admin can set per-category spending limits
- [x] **LMIT-04**: Reimbursement system enforces limits when employee submits
- [x] **LMIT-05**: System prevents submission over limit or flags for review

### Expense Categories

- [x] **CATG-01**: Admin can view default expense categories (Travel, Meals, Office, etc.)
- [x] **CATG-02**: Admin can add custom expense category
- [x] **CATG-03**: Admin can modify category name and description
- [ ] **CATG-04**: Admin can delete unused category
- [ ] **CATG-05**: Admin can set category-specific spending limit
- [ ] **CATG-06**: Employee can only submit expenses in enabled categories for their cost center

### Role Assignments & Employee Management

- [ ] **ROLE-01**: Admin can view all employees in cost center
- [ ] **ROLE-02**: Admin can assign employee as Approver (Approver 1 or 2)
- [ ] **ROLE-03**: Admin can assign employee as Finance Officer
- [ ] **ROLE-04**: Admin can change employee role (demote/promote)
- [ ] **ROLE-05**: Admin can remove employee from special role (revert to Employee)
- [ ] **ROLE-06**: Employee role indicates what they can do in the system

### Regional Rules

- [ ] **REGN-01**: Admin can configure regional rules per location
- [ ] **REGN-02**: Admin can set per-diem rates by location
- [ ] **REGN-03**: Admin can set tax/deduction rules per region
- [ ] **REGN-04**: Admin can enable/disable regions for their cost center
- [ ] **REGN-05**: System applies regional rules when processing reimbursements from that location

### Deadline Configuration

- [x] **DEAD-01**: Admin can set reimbursement submission deadline (e.g., end of month)
- [x] **DEAD-02**: Admin can set approval deadline (when approvers must act)
- [x] **DEAD-03**: Admin can set payment deadline (when Finance Officer pays)
- [x] **DEAD-04**: System shows deadline status to employees
- [x] **DEAD-05**: System flags overdue reimbursements for admin attention

### Currency Setup

- [ ] **CURR-01**: Admin can select currency for cost center
- [ ] **CURR-02**: Admin can set currency exchange rules (if multi-currency)
- [ ] **CURR-03**: Reimbursement system displays amounts in correct currency
- [ ] **CURR-04**: Payments are made in selected currency

### Configuration Management

- [ ] **CONF-01**: Admin can save configuration changes
- [ ] **CONF-02**: Admin can discard changes before saving
- [ ] **CONF-03**: Admin can view previous configuration (history/audit)
- [ ] **CONF-04**: Admin can preview how current config will affect workflow
- [ ] **CONF-05**: System shows validation errors if configuration is incomplete

### System Enforcement

- [ ] **ENFC-01**: Approval routing respects configured workflow (sequential or parallel)
- [ ] **ENFC-02**: Spending limits are enforced at submission time
- [ ] **ENFC-03**: Category limits are enforced at submission time
- [ ] **ENFC-04**: Only assigned approvers can approve reimbursements
- [ ] **ENFC-05**: Finance Officers can only see their cost center's reimbursements
- [ ] **ENFC-06**: Regional rules applied automatically based on expense location

## v2 Requirements

### Advanced Configuration

- **ADVC-01**: Admin can set approval escalation (e.g., if Approver 1 doesn't act in X days, escalate to Approver 2)
- **ADVC-02**: Admin can configure email notifications for different events
- **ADVC-03**: Admin can set cost center-specific company policies (text/terms for employees)
- **ADVC-04**: Admin can configure automatic reimbursement routing (e.g., under $50 goes to Approver 1 only)

### Analytics & Reporting

- **RPRT-01**: Admin can view reimbursement statistics for their cost center
- **RPRT-02**: Admin can generate spending reports by category
- **RPRT-03**: Admin can see approval turnaround times

### Bulk Operations

- **BULK-01**: Admin can bulk-assign roles to multiple employees
- **BULK-02**: Admin can bulk-update spending limits across categories

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-organization multi-tenancy | System assumes single organization, multiple cost centers within it |
| Approval delegation | No proxy approvals; assigned approver must approve personally |
| Custom approval workflows (beyond sequential/parallel) | Sequential or Parallel covers 99% of use cases |
| Real-time notifications | Async email notifications sufficient; not real-time |
| Workflow templates | Each cost center sets up independently; no pre-built templates |
| Audit logging dashboard | Standard git history sufficient for compliance |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| NAV-01 | 1 | Complete |
| NAV-02 | 1 | Complete |
| NAV-03 | 1 | Complete |
| NAV-04 | 1 | Complete |
| APPR-01 | 2 | Complete |
| APPR-02 | 2 | Complete |
| APPR-03 | 2 | Complete |
| APPR-04 | 2 | Complete |
| APPR-05 | 2 | Complete |
| APPR-06 | 2 | Complete |
| APPR-07 | 2 | Complete |
| LMIT-01 | 3 | Complete (03-01) |
| LMIT-02 | 3 | Complete (03-01) |
| LMIT-03 | 3 | Complete (03-01) |
| LMIT-04 | 3 | Complete (03-01) |
| LMIT-05 | 3 | Complete (03-01) |
| CATG-01 | 4 | Complete |
| CATG-02 | 4 | Complete |
| CATG-03 | 4 | Complete |
| CATG-04 | 4 | Pending |
| CATG-05 | 4 | Pending |
| CATG-06 | 4 | Pending |
| ROLE-01 | 5 | Pending |
| ROLE-02 | 5 | Pending |
| ROLE-03 | 5 | Pending |
| ROLE-04 | 5 | Pending |
| ROLE-05 | 5 | Pending |
| ROLE-06 | 5 | Pending |
| REGN-01 | 6 | Pending |
| REGN-02 | 6 | Pending |
| REGN-03 | 6 | Pending |
| REGN-04 | 6 | Pending |
| REGN-05 | 6 | Pending |
| DEAD-01 | 7 | Complete |
| DEAD-02 | 7 | Complete |
| DEAD-03 | 7 | Complete |
| DEAD-04 | 7 | Complete |
| DEAD-05 | 7 | Complete |
| CURR-01 | 8 | Pending |
| CURR-02 | 8 | Pending |
| CURR-03 | 8 | Pending |
| CURR-04 | 8 | Pending |
| CONF-01 | 8 | Pending |
| CONF-02 | 8 | Pending |
| CONF-03 | 8 | Pending |
| CONF-04 | 8 | Pending |
| CONF-05 | 8 | Pending |
| ENFC-01 | 8 | Pending |
| ENFC-02 | 8 | Pending |
| ENFC-03 | 8 | Pending |
| ENFC-04 | 8 | Pending |
| ENFC-05 | 8 | Pending |
| ENFC-06 | 8 | Pending |

**Coverage:**
- v1 requirements: 46 total
- Mapped to phases: 46
- Unmapped: 0 ✓

---

*Requirements defined: 2026-05-13*
*Traceability updated: 2026-05-13 with 8-phase roadmap*
