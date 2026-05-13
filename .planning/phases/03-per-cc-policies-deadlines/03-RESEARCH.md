# Phase 3: Per-CC Policies & Deadlines - Research

**Researched:** 2026-05-13
**Domain:** AdminConfig key-value store, submission enforcement, deadline UI, overdue flagging
**Confidence:** HIGH — all findings verified directly from source code

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LMIT-01 | Admin can set overall reimbursement limit per request | New `maxAmountPerRequest` AdminConfig key; Zod schema + VALID_KEYS extension; UI field in Deadlines/Limits section |
| LMIT-02 | Admin can set approval threshold (small requests auto-approve) | New `approvalThreshold` AdminConfig key; submission routing guard; UI number field |
| LMIT-03 | Admin can set per-category spending limits | Already exists as `maxAmountPerCategory` — confirm CC-scoped reads work after Phase 1 (they do via mergeConfigs) |
| LMIT-04 | Reimbursement system enforces limits when employee submits | POST /api/requests already enforces `maxAmountPerCategory`; extend to enforce `maxAmountPerRequest` + `approvalThreshold` |
| LMIT-05 | System prevents submission over limit or flags for review | POST /api/requests returns 400 with `details` array; same pattern for new limits |
| DEAD-01 | Admin can set reimbursement submission deadline (e.g., end of month) | Already exists as `submissionDeadline` (int, day-of-month) — verify CC-scoped; confirm UI already in config page |
| DEAD-02 | Admin can set approval deadline (when approvers must act) | Already exists as `approvalDeadline` (int, business days) — verify CC-scoped; confirm UI |
| DEAD-03 | Admin can set payment deadline (Finance Officer pays by X) | New `paymentDeadline` AdminConfig key (int, business days after approval); UI field in Deadlines section |
| DEAD-04 | System shows deadline status to employees | Employee `/employee/requests` already shows deadline countdown; extend to show approval + payment deadlines on request detail |
| DEAD-05 | System flags overdue reimbursements for admin attention | Admin dashboard already flags overdue approvals; extend to flag overdue payments (APPROVED but unpaid past paymentDeadline) |
</phase_requirements>

---

## Summary

The core infrastructure for this phase is almost entirely in place. `AdminConfig` stores all settings as key-value pairs scoped per cost center via a `@@unique([key, organizationId, costCenterId])` constraint. The GET/PUT `/api/admin/config` endpoints already accept `costCenterId` and perform a CC-over-org merge via `mergeConfigs()`. The admin config UI already has a `CostCenterSelector` at top, and all saves pass `selectedCC?.id ?? null`.

The phase is primarily additive: two new AdminConfig keys (`maxAmountPerRequest`, `paymentDeadline`), one optional new key (`approvalThreshold`), extending the POST `/api/requests` enforcement logic, and surfacing deadline status in employee and admin views. No schema migrations are needed for the AdminConfig table.

The critical bug to address first: POST `/api/requests` reads config with `prisma.adminConfig.findMany()` org-wide without CC scoping — it does not use `getConfig(prisma, key, orgId, costCenterId)`. This means limits and deadlines currently apply from org-wide rows only. The fix is to resolve the submitter's `costCenterId` and use `getConfig()` for each enforcement key.

**Primary recommendation:** Add new VALID_KEYS + Zod schemas, extend POST /api/requests enforcement with CC-scoped `getConfig()` calls, add payment deadline to config UI, and add overdue-payment flag to admin dashboard.

---

## Standard Stack

### Core (existing — do not change)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | ^3.x | Schema validation for AdminConfig values | Already used in route.ts `valueSchemas` |
| Prisma | ^6.x | AdminConfig upsert/findFirst | Pattern locked in Phase 1 |
| date-fns | ^4.x | Date arithmetic in employee UI | Already imported (`isBefore`, `format`) |
| vitest | ^4.1.5 | Unit tests | Already configured |

### Supporting (existing)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Next.js Route Handlers | (project version) | GET/PUT /api/admin/config | All config API changes |
| sonner | latest | Toast notifications | Save success/error feedback |

### No New Dependencies

All Phase 3 work uses existing packages. Do not introduce new libraries.

---

## Architecture Patterns

### Recommended Structure for New Code

```
src/
├── lib/
│   ├── config.ts               # getConfig() — no changes needed
│   ├── config-scoping.ts       # mergeConfigs(), validateCCOwnership() — no changes needed
│   └── __tests__/
│       └── submission-limits.test.ts   # NEW: Wave 0 test file
├── app/
│   ├── api/
│   │   ├── admin/config/route.ts  # Add new keys to VALID_KEYS + valueSchemas
│   │   └── requests/route.ts      # Fix CC-scoped config lookup, add new limit checks
│   └── (admin)/admin/
│       └── config/page.tsx        # Add paymentDeadline field + maxAmountPerRequest field
```

### Pattern 1: AdminConfig Key Extension

All config values are stored as `VALID_KEYS` entries with corresponding Zod schemas. Current keys:

```typescript
// src/app/api/admin/config/route.ts
const VALID_KEYS = [
  "approvalCommittee",
  "submissionDeadline",      // number int 1-31 (day of month)
  "approvalDeadline",        // number int min 1 (business days)
  "allowedCategories",
  "maxAmountPerCategory",    // Record<string, number>
  "requireReceiptAbove",     // number min 0
  "notificationChannels",
  "resubmitBehavior",
  "financeOfficer",
] as const
```

To add new keys:
1. Add to `VALID_KEYS` array
2. Add corresponding entry in `valueSchemas` object
3. Add to admin config UI with save handler
4. Add to public config endpoint if employees need to read it

**New keys for Phase 3:**

```typescript
// Add to VALID_KEYS:
"maxAmountPerRequest",  // number min 0 (0 = no limit)
"paymentDeadline",      // number int min 1 (business days after approval)
"approvalThreshold",    // number min 0 (0 = no auto-approve; requests under this auto-approve)

// Corresponding Zod schemas:
maxAmountPerRequest: z.number().min(0),
paymentDeadline: z.number().int().min(1),
approvalThreshold: z.number().min(0),
```

### Pattern 2: CC-Scoped Config Lookup in Submission

**Current (broken for CC scoping):**

```typescript
// src/app/api/requests/route.ts — CURRENT, does NOT respect CC
const configs = await prisma.adminConfig.findMany()
const configMap: Record<string, unknown> = {}
for (const c of configs) {
  configMap[c.key] = c.value
}
// Then reads configMap.submissionDeadline etc.
```

**Fixed pattern (use for Phase 3):**

```typescript
// After creating the request, resolve submitter's CC:
const submitter = await prisma.user.findUnique({
  where: { id: session.user.id },
  select: { costCenterId: true, organizationId: true },
})
const submitterCCId = submitter?.costCenterId ?? null
const orgId = session.user.organizationId ?? null

// Use getConfig for each key with CC scope:
const [submissionDeadline, allowedCat, maxAmtPerCat, requireReceipt, maxAmtPerReq, approvalThresh] =
  await Promise.all([
    getConfig(prisma, "submissionDeadline", orgId, submitterCCId),
    getConfig(prisma, "allowedCategories", orgId, submitterCCId),
    getConfig(prisma, "maxAmountPerCategory", orgId, submitterCCId),
    getConfig(prisma, "requireReceiptAbove", orgId, submitterCCId),
    getConfig(prisma, "maxAmountPerRequest", orgId, submitterCCId),
    getConfig(prisma, "approvalThreshold", orgId, submitterCCId),
  ])
```

Note: `getConfig()` is already imported in `approval-routing-helpers.ts` and implements the 3-tier precedence (CC → org → global). It is the correct function to use.

### Pattern 3: Overdue Flagging (existing + extend)

The admin dashboard (`/admin/page.tsx`) already computes overdue approval steps:

```typescript
// src/app/(admin)/admin/page.tsx — existing pattern
const overdueSteps = pendingSteps.filter((step) => {
  const submittedAt = step.request.submittedAt ?? step.request.createdAt
  const deadline = addBusinessDays(submittedAt, deadlineBusinessDays)
  return deadline <= now
})
```

For DEAD-05 (flag overdue payments): replicate this pattern for APPROVED requests that have passed the payment deadline. The `approvedAt` timestamp is not stored on `ReimbursementRequest` directly — use `ApprovalStep.decidedAt` for the last APPROVED step, or use `ReimbursementRequest.updatedAt` when transitioning to APPROVED status. The simpler approach: use `updatedAt` as proxy for when status changed to APPROVED, and compare against `paymentDeadline` business days from that date.

### Pattern 4: Deadline Status in Employee UI

The employee `/employee/requests/page.tsx` already shows deadline status via:
- `submissionDeadlineDay` state variable from `/api/config/public`
- `daysUntilDeadline(folder.deadline)` computation  
- `AlertTriangle` / `Clock` / `CheckCircle` icons for urgency levels

For DEAD-04 (show approval + payment deadline status): the individual request detail page (`/employee/requests/[id]/page.tsx`) is the appropriate location for per-request deadline status, not the dashboard folder view. Show: "Awaiting approval — due [date]" or "Approved — payment due [date]".

The public config endpoint (`/api/config/public`) currently does NOT include `approvalDeadline` or `paymentDeadline`. These need to be added for employee access, or the individual request page can fetch them separately.

### Anti-Patterns to Avoid

- **Reading AdminConfig without CC scope at submission time:** The current `prisma.adminConfig.findMany()` call in POST /api/requests is the bug this phase fixes. Do not propagate this pattern.
- **Storing deadline as a Date object:** Keep deadlines as integer fields (day-of-month or business-days). Date objects create timezone complexity. The existing pattern is correct.
- **Adding `paymentDeadline` to `ReimbursementRequest` model:** This is config, not per-request data. Store it in AdminConfig like all other deadlines.
- **Computing overdue status on the client:** Always compute server-side where `now` is authoritative.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CC-precedence config lookup | Custom findMany + filter | `getConfig(prisma, key, orgId, ccId)` | Already implements 3-tier precedence correctly |
| CC-over-org config merge | Custom merge logic | `mergeConfigs(ccRows, orgRows)` | O(n+m) map-based, tested |
| Business days arithmetic | Custom loop | `addBusinessDays()` in `/admin/page.tsx` (copy it to a shared util) | Edge cases around weekends handled |
| AdminConfig upsert | Custom create/update | Prisma `upsert` with `key_organizationId_costCenterId` compound key | Already used in PUT handler |

---

## Common Pitfalls

### Pitfall 1: Stale config reads at submission time

**What goes wrong:** POST /api/requests currently calls `prisma.adminConfig.findMany()` without filtering by org or CC. This reads all rows across all orgs and uses the first value found for each key. If two orgs have different `submissionDeadline` values, the behavior is non-deterministic.

**Why it happens:** Phase 1 fixed the admin config UI (reads/writes scoped), but did not update the submission enforcement path.

**How to avoid:** Replace the current `findMany()` block with parallel `getConfig()` calls using the submitter's `orgId` and `costCenterId`.

**Warning signs:** Tests pass with single-org data but fail when two orgs have different limits.

### Pitfall 2: The `submissionDeadline` value schema mismatch

**What goes wrong:** The admin config GET/PUT and Zod schema store `submissionDeadline` as a bare `number` (e.g., `25`). But the submission enforcement code in POST /api/requests reads it as `{ day?: number }` — an object shape. These are inconsistent.

**Evidence from code:**
```typescript
// Route.ts Zod schema:
submissionDeadline: z.number().int().min(1).max(31),   // bare number

// requests/route.ts reads it as:
const submissionDeadlineConfig = configMap.submissionDeadline as { day?: number } | null
const submissionDeadline = submissionDeadlineConfig?.day ?? null   // extracts .day

// public/route.ts consumer reads:
if (configs.submissionDeadline?.day) {   // expects object
```

**How to avoid:** The Zod schema defines the source of truth. The correct value is a bare number. The requests/route.ts and public/route.ts must be updated to read the bare number directly, not `.day`. This is a pre-existing bug that Phase 3 must fix as part of the refactor.

**Correct read pattern:**
```typescript
const submissionDeadline = (await getConfig(prisma, "submissionDeadline", orgId, ccId)) as number | null
```

### Pitfall 3: Payment deadline has no stored event time

**What goes wrong:** To compute "overdue payment," we need to know when the request was approved. `ReimbursementRequest` has no `approvedAt` field. `ApprovalStep.decidedAt` is the closest, but a request with 2 sequential approvers has two approval steps — we need the final one.

**How to avoid:** Query the last `ApprovalStep` with `status: "APPROVED"` ordered by `decidedAt` DESC for each request. Or use `ReimbursementRequest.updatedAt` as a proxy (it updates on status change). The `updatedAt` approach is simpler and sufficient for a business-days SLA check.

### Pitfall 4: `maxAmountPerCategory` currency mismatch

**What goes wrong:** Category limits are stored as plain numbers (e.g., `{ MEALS: 500 }`). The `amount` field on a reimbursement request can be in any currency. The enforcement compares `Number(amount) > maxAmountPerCategory[category]` directly without currency conversion.

**Current state:** This bug pre-dates Phase 3 but Phase 3 adds `maxAmountPerRequest` with the same pattern. The planner should note that limit enforcement is nominal (in request currency), not in a normalized currency. This is acceptable for v1 but should be documented as a known limitation.

**How to avoid:** Keep consistent with existing pattern — store and compare in the same units. Document that limits are in the CC's configured currency.

### Pitfall 5: `approvalThreshold` and approval step creation conflict

**What goes wrong:** If `approvalThreshold > 0` and a request amount is below the threshold, it should auto-approve. But the current code creates approval steps unconditionally and sends notifications. An auto-approved request should either: (a) skip step creation, or (b) create steps and immediately mark them APPROVED.

**How to avoid:** Use option (a) — if `amount <= approvalThreshold`, set `status = "APPROVED"` directly and skip step creation. Add an audit log entry noting auto-approval. This is simpler and avoids zombie approval steps.

---

## Code Examples

Verified patterns from the actual codebase:

### Adding a new VALID_KEY (route.ts)

```typescript
// Source: src/app/api/admin/config/route.ts
const VALID_KEYS = [
  // ... existing keys ...
  "maxAmountPerRequest",   // add here
  "paymentDeadline",       // add here
  "approvalThreshold",     // add here
] as const

const valueSchemas: Record<string, z.ZodTypeAny> = {
  // ... existing schemas ...
  maxAmountPerRequest: z.number().min(0),
  paymentDeadline: z.number().int().min(1),
  approvalThreshold: z.number().min(0),
}
```

### CC-scoped config read (correct pattern)

```typescript
// Source: src/lib/config.ts — getConfig signature
export async function getConfig(
  prisma: PrismaClient,
  key: string,
  orgId?: string | null,
  costCenterId?: string | null
)
// Returns: CC row > org row > global row, or null if none
```

### Admin config page save pattern

```typescript
// Source: src/app/(admin)/admin/config/page.tsx
async function handleSaveDeadlines() {
  setSavingDeadlines(true)
  const [ok1, ok2] = await Promise.all([
    saveConfig("submissionDeadline", submissionDeadline, selectedCC?.id ?? null),
    saveConfig("approvalDeadline", approvalDeadline, selectedCC?.id ?? null),
  ])
  if (ok1 && ok2) toast.success("Deadlines saved")
  else toast.error("Failed to save deadlines")
  setSavingDeadlines(false)
}
// Pattern: saveConfig(key, value, costCenterId) — costCenterId captured at call time
```

### Overdue detection (existing admin dashboard)

```typescript
// Source: src/app/(admin)/admin/page.tsx
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const day = result.getDay()
    if (day !== 0 && day !== 6) { added++ }
  }
  return result
}

const overdueSteps = pendingSteps.filter((step) => {
  const submittedAt = step.request.submittedAt ?? step.request.createdAt
  const deadline = addBusinessDays(submittedAt, deadlineBusinessDays)
  return deadline <= now
})
```

### Employee deadline countdown (existing)

```typescript
// Source: src/app/(employee)/employee/requests/page.tsx
const daysUntilDeadline = (deadline: Date) => {
  const now = new Date()
  const diff = deadline.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}
// Used with AlertTriangle (<=3 days), Clock (>3 days), CheckCircle (closed)
```

---

## State of the Art

| Old Approach | Current Approach | Phase 3 Change |
|--------------|------------------|----------------|
| Org-wide findMany() for submission limits | Already CC-scoped in admin UI | Fix submission enforcement to use getConfig() CC-scoped |
| No overall per-request limit | — | Add `maxAmountPerRequest` AdminConfig key |
| No payment deadline | — | Add `paymentDeadline` AdminConfig key |
| Overdue approvals only in admin | Approval overdue count on dashboard | Add overdue payment count (APPROVED, unpaid, past deadline) |
| Employee sees submission deadline only | Folder-level deadline indicator | Extend to show approval/payment deadlines on request detail |

**Deprecated/outdated:**
- `prisma.adminConfig.findMany()` without org/CC scope in POST /api/requests: replaced by `getConfig()` calls with submitter's org+CC

---

## Open Questions

1. **`approvalDeadline` as business days vs. calendar days**
   - What we know: currently stored as a plain number, admin UI labels it "Approval SLA (business days)" — `addBusinessDays()` is used in the admin dashboard
   - What's unclear: the admin config page's current `handleSaveDeadlines` saves `approvalDeadline` as a bare number — is that the number of business days? The admin dashboard reads `approvalDeadlineConfig` as `{ businessDays?: number }` with `.businessDays` property, which is another shape mismatch similar to `submissionDeadline.day`.
   - Recommendation: standardize all deadline config values as bare numbers; fix all readers to read bare number. Document in plan.

2. **Where employee sees approval/payment deadline**
   - What we know: DEAD-04 says "deadline status shown to employees." The folder view shows submission deadline. Individual request detail (`/employee/requests/[id]/page.tsx`) not yet read in this research.
   - What's unclear: does the request detail page already show status timeline? Is there an appropriate slot for approval/payment deadline display?
   - Recommendation: Planner should include reading `/employee/requests/[id]/page.tsx` as Wave 0 task to confirm injection point.

3. **`approvalThreshold` scope conflict with approval step creation**
   - What we know: auto-approve means bypassing the committee flow entirely.
   - What's unclear: LMIT-02 says "small requests auto-approve" — does this skip all steps including Finance Officer, or just approvers?
   - Recommendation: Planner should define: auto-approved requests skip approvers but still notify Finance Officer (payment still required). Plan accordingly.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.5 |
| Config file | `vitest.config.ts` (root) |
| Setup file | `vitest.setup.ts` — sets env vars including dummy DATABASE_URL |
| Quick run command | `npx vitest run src/lib/__tests__/submission-limits.test.ts` |
| Full suite command | `npx vitest run` |
| Test include glob | `src/**/*.test.ts` |
| Environment | node |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LMIT-01 | `maxAmountPerRequest` Zod schema rejects negative, accepts 0 | unit | `npx vitest run src/lib/__tests__/submission-limits.test.ts` | Wave 0 |
| LMIT-01 | Submission blocked when `amount > maxAmountPerRequest` | unit | `npx vitest run src/lib/__tests__/submission-limits.test.ts` | Wave 0 |
| LMIT-02 | `approvalThreshold` Zod schema accepts 0 (disabled) | unit | `npx vitest run src/lib/__tests__/submission-limits.test.ts` | Wave 0 |
| LMIT-02 | Request under threshold sets status=APPROVED, skips steps | unit | `npx vitest run src/lib/__tests__/submission-limits.test.ts` | Wave 0 |
| LMIT-03 | `maxAmountPerCategory` CC row overrides org row | unit | `npx vitest run src/lib/__tests__/config-scoping.test.ts` | ✅ exists |
| LMIT-04 | Submission enforces CC-specific category limit (not org-wide) | unit | `npx vitest run src/lib/__tests__/submission-limits.test.ts` | Wave 0 |
| LMIT-05 | Response includes `details` array on limit violation | unit | `npx vitest run src/lib/__tests__/submission-limits.test.ts` | Wave 0 |
| DEAD-01 | CC-specific `submissionDeadline` read via `getConfig()` | unit | `npx vitest run src/lib/__tests__/submission-limits.test.ts` | Wave 0 |
| DEAD-02 | CC-specific `approvalDeadline` read correctly | unit | `npx vitest run src/lib/__tests__/submission-limits.test.ts` | Wave 0 |
| DEAD-03 | `paymentDeadline` Zod schema: int, min 1 | unit | `npx vitest run src/lib/__tests__/submission-limits.test.ts` | Wave 0 |
| DEAD-04 | Employee deadline indicator shows correct days remaining | manual | — (React UI, no React renderer in test env) | manual-only |
| DEAD-05 | `isOverduePayment()` returns true past paymentDeadline days | unit | `npx vitest run src/lib/__tests__/submission-limits.test.ts` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run src/lib/__tests__/submission-limits.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/__tests__/submission-limits.test.ts` — covers LMIT-01, LMIT-02, LMIT-04, LMIT-05, DEAD-01, DEAD-02, DEAD-03, DEAD-05
  - Mock `getConfig` via `vi.mock("@/lib/config", ...)` (same pattern as `approval-routing.test.ts`)
  - Test `validateSubmission(amount, category, config)` pure helper extracted from POST /api/requests
  - Test `isOverduePayment(approvedAt, paymentDeadlineDays, now)` pure helper

No new framework install needed — vitest already configured.

---

## Sources

### Primary (HIGH confidence)

- `src/app/api/admin/config/route.ts` — VALID_KEYS, valueSchemas, GET/PUT implementation, CC scoping
- `prisma/schema.prisma` — AdminConfig model, unique constraint, CostCenter relations, ReimbursementRequest fields
- `src/lib/config.ts` — `getConfig()` three-tier precedence implementation
- `src/lib/config-scoping.ts` — `mergeConfigs()`, `validateCCOwnership()`
- `src/app/api/requests/route.ts` — POST submission enforcement (current bugs visible)
- `src/app/(admin)/admin/config/page.tsx` — existing UI, deadline fields, save handlers
- `src/app/(employee)/employee/requests/page.tsx` — deadline status display in employee UI
- `src/app/(admin)/admin/page.tsx` — overdue approval detection, `addBusinessDays()` helper
- `src/app/api/config/public/route.ts` — public config endpoint (employee-accessible)
- `src/lib/__tests__/config-scoping.test.ts` — existing test patterns (vi.mock pattern)
- `src/lib/__tests__/approval-routing.test.ts` — existing test patterns (vi.mock for getConfig)
- `vitest.config.ts` — framework config, include glob, setup file
- `vitest.setup.ts` — env var setup for tests

### Secondary (MEDIUM confidence)

None — all findings verified from source.

### Tertiary (LOW confidence)

None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries identified from existing imports
- Architecture: HIGH — all patterns verified from existing working code
- Pitfalls: HIGH — bugs verified by reading the actual mismatched code
- Test patterns: HIGH — vitest config and existing test files read directly

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (stable codebase, no fast-moving dependencies)
