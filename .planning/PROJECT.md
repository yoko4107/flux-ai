# System Configuration: Cost Center Admin Panel

## What This Is

A comprehensive admin control panel where cost center administrators independently configure their entire reimbursement workflow—approval chains, spending limits, currency, regional tax/per-diem rules, expense categories, deadline policies, and role assignments. The system enforces these rules across the reimbursement submission and approval process, allowing admins to customize every aspect of their cost center without code changes.

## Core Value

Admins can configure all reimbursement rules per cost center without technical support—approval workflows, limits, categories, regional rules, deadlines, and role assignments are fully configurable and immediately enforced in the system.

## Requirements

### Validated

- ✓ Core cost center data model exists — database structure and basic relationships established

### Active

- [ ] Admin can select and manage multiple cost centers
- [ ] Admin can configure approval workflow (sequential or parallel approval chain)
- [ ] Admin can configure spending limits and thresholds
- [ ] Admin can add, modify, and delete expense categories (special items)
- [ ] Admin can assign employees to roles (Approver 1, Approver 2, Finance Officer, Employee)
- [ ] Admin can set regional rules (tax, per-diem rates by location)
- [ ] Admin can configure deadlines (submission windows, approval deadlines, payment windows)
- [ ] Admin can set currency per cost center
- [ ] System enforces approval routing based on configured workflow
- [ ] System enforces spending limits based on configured policies
- [ ] System respects regional rules when processing reimbursements
- [ ] Admin can preview/test configuration before it goes live
- [ ] Employee manager page exists to assign roles per cost center

### Out of Scope

- Multi-tenant billing/invoicing — Cost centers are not separate customers
- Role inheritance/delegation — No proxy approvals or approval delegation
- Real-time notifications — Emails sent via standard triggers, not real-time
- Audit trail beyond standard git commits — No detailed audit logging in first release

## Context

This project is part of an existing reimbursement app (Ringkas). The app already has:
- Basic employee/cost center relationship
- Reimbursement submission flow
- Payroll rule organization (partially implemented)

The system configuration layer is the administrative backbone that controls how reimbursements are processed for each cost center. Success means admins have complete self-service configuration without needing developer help.

## Constraints

- **Tech Stack**: Next.js + TypeScript (per app conventions, consult node_modules/next/dist/docs/ for breaking changes)
- **Database**: Existing Prisma schema must be extended (index.ts entry point already added)
- **Pattern**: Match existing cost center management patterns (follow recent PRs on cost center features)
- **Timeline**: Comprehensive feature set; will be broken into phases by roadmap

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Cost center-based configuration (not organization-wide) | Each cost center has unique rules; admins manage independently | ✓ Clear scope boundary |
| Configuration enforced at submission/approval time | Admins control entire workflow; rules checked when reimbursement is processed | — Pending implementation |
| Admin can configure everything via UI | No hardcoded defaults; full flexibility | — Pending implementation |

---
*Last updated: 2026-05-13 after project initialization*
