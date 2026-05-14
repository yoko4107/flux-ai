# Phase 5: Validation & Polish - Research

**Researched:** 2026-05-14
**Domain:** Next.js 16 App Router client state management, form validation UX, beforeunload guard, approval enforcement
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONF-01 | Admin can save configuration changes | Already works. Research confirms each section has its own `handleSave*` handler calling `saveConfig()`. Verify only — no new save infrastructure needed. |
| CONF-02 | Admin can discard changes before saving | No dirty tracking exists. Need: `savedState` snapshot on load + `isDirty` comparison + `window.beforeunload` handler + in-page discard button. |
| CONF-04 | Admin can preview how current config will affect workflow | `WorkflowPreviewCard` is already wired to live `committee` + `financeOfficerId` state — it reacts to unsaved edits. Verify it is still correct; likely only needs a polish check. |
| CONF-05 | System shows validation errors if configuration is incomplete | No empty-committee guard on save. Need: pre-save check in `handleSaveCommittee` returning inline error + blocking save if `committee.approvers.length === 0`. |
| ENFC-01 | Approval routing respects configured workflow (sequential or parallel) | `resolveCommittee` + `buildApprovalSteps` + `selectNotifyTargets` are in place. E2E chain confirmed. Need: smoke-test script or manual checklist confirming sequential vs parallel routing on live submissions. |
</phase_requirements>

---

## Summary

Phase 5 is a polish and correctness phase on top of a largely working system. Four of the five requirements need relatively small additions; one (ENFC-01) is an end-to-end verification task rather than new code.

The admin config page (`/admin/config`) holds all configurable state in flat `useState` variables — one per config key — with no shared dirty-tracking layer. Every section has its own save handler and `saving*` boolean. There is no snapshot of "what was last saved", meaning unsaved-change detection must be added as a new concern.

Next.js 16 App Router provides no built-in navigation guard or beforeunload API. The standard approach is `window.addEventListener("beforeunload", ...)` in a `useEffect` for browser tab-close/refresh, combined with an in-page confirmation dialog triggered by any internal navigation link click. `router.events` no longer exists in the App Router; navigation changes are detected only via `usePathname` + `useSearchParams` effects after the fact — too late to block.

**Primary recommendation:** Track dirty state per-section using a single `dirtyKeys: Set<string>` ref updated on every field change; show a banner when `dirtyKeys.size > 0`; hook `beforeunload` and wrap sidebar nav links with a confirm dialog.

---

## Current State Audit

### 1. Unsaved-Changes Tracking (CONF-02)

**How state is managed:** All config fields live as plain `useState` variables in `AdminConfigPage` (the single large component). There are 10+ independent state variables:
- `committee`, `financeOfficerId`, `submissionDeadline`, `approvalDeadline`, `paymentDeadline`, `maxAmounts`, `requireReceiptAbove`, `maxAmountPerRequest`, `approvalThreshold`, `allowedCategories`, `notifChannels`, `resubmitBehavior`, `customCategories`

**Dirty tracking: none.** When `loadData(ccId)` runs, state is written from the API response but no snapshot is kept. Each `handleSave*` function writes to the API but does not update a "last saved" reference.

**Pattern to add:**
```typescript
// Source: codebase analysis — no existing pattern; proposing canonical approach
const savedRef = useRef<SavedSnapshot | null>(null)

// After loadData resolves, capture snapshot:
savedRef.current = { committee, financeOfficerId, submissionDeadline, ... }

// isDirty check:
const isDirty = !deepEqual(currentState, savedRef.current)

// After each successful save, update snapshot:
savedRef.current = { ...savedRef.current, [key]: newValue }
```

**Alternative (simpler):** Track `dirtyKeys: Set<string>` — add the config key on any field change, remove it on successful save. Does not require deep-equal. Banner shows when set is non-empty.

The `dirtyKeys` set approach is preferred because it maps 1:1 to config keys already in use and avoids JSON diffing complexity.

### 2. Navigation Guard (CONF-02 continued)

**Next.js 16 App Router constraint:** `router.events` is removed. There is no built-in `router.beforeNavigate` hook. Official docs confirm App Router navigation is detected after the fact via `usePathname` + `useSearchParams` effects — not interceptable.

**The two cases that need coverage:**

| Case | Mechanism | Confidence |
|------|-----------|------------|
| Browser close / tab refresh / hard navigation | `window.addEventListener("beforeunload", handler)` in a `useEffect` | HIGH — standard browser API, works in all browsers |
| Internal SPA navigation (clicking sidebar link) | No built-in intercept. Must wrap nav link clicks OR show a persistent "you have unsaved changes" banner + rely on `beforeunload` only | HIGH — confirmed by Next.js docs analysis |

**Recommended approach:** Two-pronged:
1. `useEffect` attaches `beforeunload` when `isDirty` is true; removes it when false.
2. Prominent inline banner above the CC selector when dirty, with a "Discard Changes" button that resets all state to `savedRef.current`.

Do NOT try to intercept `<Link>` navigation programmatically. The sidebar uses standard `<Link>` components. The browser `beforeunload` covers hard navigations; the banner + discard button covers in-page discards.

```typescript
// Source: MDN beforeunload + codebase useEffect pattern
useEffect(() => {
  if (!isDirty) return
  const handler = (e: BeforeUnloadEvent) => {
    e.preventDefault()
    e.returnValue = "" // Required for Chrome
  }
  window.addEventListener("beforeunload", handler)
  return () => window.removeEventListener("beforeunload", handler)
}, [isDirty])
```

### 3. Config Validation — Empty Committee Block (CONF-05)

**Current state:** `handleSaveCommittee` calls `saveConfig("approvalCommittee", committee, ...)` with no pre-check. An empty `committee.approvers` array will be saved successfully (API Zod schema allows `approvers: z.array(z.string())` — empty array is valid).

**What to add:** A guard in `handleSaveCommittee` before the API call:

```typescript
// Source: codebase analysis — no existing validation guard
async function handleSaveCommittee() {
  if (committee.approvers.length === 0) {
    setCommitteeError("Approval committee must have at least one approver.")
    return
  }
  setCommitteeError(null)
  setSavingCommittee(true)
  // ... existing save logic
}
```

Add `committeeError: string | null` state; render it as a red inline error below the approvers list (same location as the existing "No approvers configured" gray text). No toast for validation errors — inline only. Toasts are used for success/failure of the network call.

**Pattern:** This codebase uses `toast.error()` for API failures and `toast.success()` for success. For client-side pre-save validation, use inline `<p className="text-sm text-red-500">` — consistent with `AddCustomCategoryRow`'s existing error rendering.

### 4. WorkflowPreviewCard Audit (CONF-04)

**Current state:** `WorkflowPreviewCard` receives `committee`, `users`, `financeOfficerId`, and `selectedCC` as props — all live state from `AdminConfigPage`. It calls `derivePreviewSteps(committee)` to compute steps. It is already a live preview, not a saved-state preview.

**Verified behaviors:**
- Shows "No approvers configured — requests will not route." when `committee.approvers.length === 0`
- Shows sequential steps with "(Step N)" labels
- Shows parallel steps with "(parallel)" label
- Shows Finance Officer name or "Finance Officer (not set)"
- Shows cost center name in subtitle

**Issues found:**
- `React.Fragment` keys are missing in the sequential mode map (`<>` inside `.map()` without a key). This causes React key warnings but is not a functional bug. Fix: wrap with `<React.Fragment key={step.id}>` instead of `<>`.
- The component is already wired to live state — CONF-04 is essentially done. The plan should include a "verify + fix key warning" task, not a rebuild.

### 5. End-to-End Enforcement Chain (ENFC-01)

**The full chain for a submitted request:**

```
POST /api/requests (status=SUBMITTED)
  → getConfig(prisma, "approvalCommittee", orgId, submitterCCId)   [resolves CC-specific]
  → resolveCommittee() in approval-routing-helpers.ts
  → buildApprovalSteps(requestId, rawApprovers)                    [pure, tested]
  → selectNotifyTargets(mode, stepData)                            [pure, tested]
  → prisma.approvalStep.createMany(stepData)
  → sendNotification() for each notifyTarget
```

**Sequential enforcement:** Only `stepData[0].approverId` is notified on submission. On the approve route (`/api/requests/[id]/approve`), only the current step's approver can act — the next step's approver is not notified until the current step completes.

**Parallel enforcement:** All approvers are notified simultaneously. All must approve before the request advances.

**What to verify (not rebuild):** Confirm the approve route correctly advances sequential steps and checks parallel completion. This is verification work, not new code.

**Where the approve route lives:**
`src/app/api/requests/[id]/approve/route.ts`

The plan should include a "read and document the approve route" task to produce a verification checklist.

### 6. Toast vs Inline Error Pattern

**Established pattern in this codebase:**

| Scenario | Pattern | Example |
|----------|---------|---------|
| API call success | `toast.success("message")` | `handleSaveCommittee` success |
| API call failure | `toast.error("message")` | `handleSaveCommittee` failure |
| Client-side validation (pre-save) | Inline `<p className="text-sm text-red-500">` | `AddCustomCategoryRow` error state |
| Empty list (informational) | `<p className="text-sm text-gray-500">` | "No approvers configured." |

**CONF-05 rule:** Block save + show inline error. Do NOT show a toast for the validation block — toast is for async operations.

### 7. Existing Test Coverage

**Test files that exist:**
- `src/lib/__tests__/submission-limits.test.ts` — `validateSubmission`, `shouldAutoApprove`, `isOverduePayment` (fully covered, 120 tests pass)
- `src/lib/__tests__/approval-routing.test.ts` — `resolveCommittee`, `buildApprovalSteps`, `selectNotifyTargets` (fully covered)
- `src/lib/__tests__/workflow-preview.test.ts` — `derivePreviewSteps` (3 tests)
- `src/lib/__tests__/config-scoping.test.ts` — `mergeConfigs`, `validateCCOwnership` (8 tests)
- `src/lib/__tests__/custom-categories.test.ts` — `mergeCategories`, `customCategorySchema` (8 tests)

**Test run status:** 12 test files pass (120 tests). 3 fail due to missing Prisma client generation (`leave-email.test.ts`, `leave-policy.test.ts`, `per-diem.test.ts`) — these are pre-existing failures unrelated to Phase 5.

**Coverage gaps for Phase 5:** The new dirty-tracking logic and the empty-committee validation guard are client-side UI concerns. They cannot be tested with the current Vitest `environment: "node"` setup without adding jsdom support. These remain manual verification items.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deep equality for dirty check | Custom recursive diffing | Simple `dirtyKeys: Set<string>` tracking | Avoids JSON comparison edge cases with Date/null |
| Navigation interception | Monkey-patching `<Link>` or `history.pushState` | `beforeunload` + inline banner | App Router has no `router.events`; patching history is fragile |
| Confirm dialog | Custom modal | `window.confirm()` for beforeunload (browser default) | Browser handles this natively; custom modal cannot block SPA navigation reliably |
| Validation library | Adding Zod to client component | Inline `committee.approvers.length === 0` check | One guard, one condition — no library needed |

---

## Architecture Patterns

### Dirty State Pattern (Recommended)

```typescript
// Source: codebase analysis — extending existing useState pattern in page.tsx
// Track which config keys have unsaved changes
const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())

// Call this whenever a field changes:
function markDirty(key: string) {
  setDirtyKeys(prev => new Set(prev).add(key))
}

// Call this after successful save:
function markClean(key: string) {
  setDirtyKeys(prev => { const next = new Set(prev); next.delete(key); return next })
}

const isDirty = dirtyKeys.size > 0
```

### Unsaved Banner Pattern

```tsx
// Source: codebase analysis — following existing Tailwind + amber/warning patterns
{isDirty && (
  <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
    <span>You have unsaved changes.</span>
    <Button variant="ghost" size="sm" onClick={handleDiscardAll}>Discard</Button>
  </div>
)}
```

### CC Switch Guard

When `selectedCC` changes, if `isDirty`, either: (a) prompt user to save or discard first, or (b) auto-discard and reload. The simpler approach is (b): clear `dirtyKeys` in `setSelectedCC` handler and let `loadData` reset all state naturally. This is consistent with the existing behavior (switching CC always reloads config without a save prompt).

---

## Common Pitfalls

### Pitfall 1: Capturing stale state in beforeunload handler
**What goes wrong:** The `beforeunload` handler closes over the initial `isDirty` value (always false) because `useEffect` dependencies are not listed.
**How to avoid:** Include `isDirty` in the `useEffect` dependency array. The effect re-runs every time `isDirty` changes, attaching/removing the handler correctly.

### Pitfall 2: Firing "dirty" on CC switch (false positive)
**What goes wrong:** `loadData` resets all state after a CC change. If `markDirty` is called during state initialization (not user action), `isDirty` becomes true immediately after loading.
**How to avoid:** Only call `markDirty` from user-triggered handlers (onChange, onClick), not from the initial `useEffect` that populates state. The `loadData` path must not trigger dirty tracking.

### Pitfall 3: WorkflowPreviewCard React key warning becoming a test failure
**What goes wrong:** The sequential mode renders `<>` (React.Fragment) inside `.map()` without a `key` prop. In React strict mode this emits a warning but does not fail renders.
**How to avoid:** Replace `<>...</>` with `<React.Fragment key={step.id}>...</React.Fragment>` in the sequential branch of `WorkflowPreviewCard`.

### Pitfall 4: Blocking valid empty-committee saves for draft configs
**What goes wrong:** Blocking all saves when `approvers.length === 0` prevents admins from clearing approvers on a CC where auto-approve handles everything.
**How to avoid:** Per requirements, CONF-05 says "block save if approval committee is empty". Accept this as intentional. An admin who wants zero approvers must set `approvalThreshold` to cover all amounts. The validation message should explain this.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test` (runs `vitest run`) |
| Full suite command | `npm test` |
| Environment | `node` (no jsdom — React components cannot be unit-tested without adding jsdom) |
| Test pattern | `src/**/*.test.ts` (only `.test.ts`, not `.test.tsx`) |

### Phase 5 Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONF-01 | Save config writes CC-scoped AdminConfig row | Manual verification | — | N/A |
| CONF-02 | Dirty indicator appears after field edit | Manual | — | N/A |
| CONF-02 | beforeunload fires when dirty | Manual (browser) | — | N/A |
| CONF-02 | Discard button resets all fields to last loaded state | Manual | — | N/A |
| CONF-04 | WorkflowPreviewCard reflects live committee state | `derivePreviewSteps` tests | `npm test -- --grep "derivePreviewSteps"` | ✅ |
| CONF-05 | Save blocked when approvers empty, inline error shown | Manual | — | N/A |
| ENFC-01 | Sequential: only step-0 approver notified on submit | `selectNotifyTargets` test | `npm test -- --grep "sequential"` | ✅ |
| ENFC-01 | Parallel: all approvers notified on submit | `selectNotifyTargets` test | `npm test -- --grep "parallel"` | ✅ |
| ENFC-01 | CC-specific committee used over org-wide | `resolveCommittee` test | `npm test -- --grep "CC lookup"` | ✅ |

### Sampling Rate

- **Per task commit:** `npm test` (all pure-helper tests — 120 tests, ~1s)
- **Per wave merge:** `npm test` (same)
- **Phase gate:** `npm test` green + manual checklist items passed

### Wave 0 Gaps

No new test files needed for Phase 5. The behaviors being added (dirty tracking, beforeunload, inline validation error) are all React component concerns that require a browser environment. Adding jsdom to vitest is out of scope for this phase — the current `node` environment is intentional per the existing pattern.

The existing test suite already covers CONF-04 and ENFC-01 at the pure-helper level. CONF-02 and CONF-05 are UI-only and require manual verification.

**Manual verification checklist (no automation):**
- [ ] Edit committee mode → "unsaved changes" banner appears
- [ ] Reload/close tab with dirty state → browser confirms before leaving
- [ ] Click "Discard" → all fields reset to last API values
- [ ] Save with zero approvers → inline error appears, API not called
- [ ] WorkflowPreviewCard updates live as approvers are added/removed
- [ ] Submit a request to CC A with sequential committee → only approver 1 notified
- [ ] Submit a request to CC A with parallel committee → all approvers notified

---

## Sources

### Primary (HIGH confidence)
- Codebase: `src/app/(admin)/admin/config/page.tsx` — full component structure, all state variables, save handlers
- Codebase: `src/app/api/admin/config/route.ts` — Zod validation schemas, VALID_KEYS, save path
- Codebase: `src/app/api/requests/route.ts` — full submission enforcement chain
- Codebase: `src/lib/approval-routing-helpers.ts` — `resolveCommittee`, `buildApprovalSteps`, `selectNotifyTargets`
- Codebase: `src/lib/submission-limits.ts` — `validateSubmission`, `shouldAutoApprove`
- Codebase: `src/lib/workflow-preview-helpers.ts` — `derivePreviewSteps`
- Next.js 16.2.4 official docs: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md` — confirmed `router.events` removed, no beforeNavigate API
- Vitest config: `vitest.config.ts` — `environment: "node"`, `include: ["src/**/*.test.ts"]`

### Secondary (MEDIUM confidence)
- MDN beforeunload API — standard browser behavior for tab close / hard navigation

---

## Metadata

**Confidence breakdown:**
- Current state audit: HIGH — read actual source files
- Navigation guard pattern: HIGH — confirmed from Next.js official docs + MDN
- Dirty tracking pattern: HIGH — straightforward React state, no library needed
- Pitfalls: HIGH — identified from code review of existing implementations
- Test scope: HIGH — ran test suite, confirmed what passes and what is unreachable in node env

**Research date:** 2026-05-14
**Valid until:** 2026-06-14 (stable Next.js App Router APIs; no fast-moving dependencies)
