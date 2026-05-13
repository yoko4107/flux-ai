# Phase 1: Cost Center Config Scoping - Research

**Researched:** 2026-05-13
**Domain:** Next.js 16 + Prisma ORM — scoping AdminConfig reads/writes per cost center
**Confidence:** HIGH (all findings from direct codebase inspection)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NAV-01 | Admin can view list of cost centers they manage | `/api/admin/cost-centers` GET already returns full CC list with `_count`; no new API needed |
| NAV-02 | Admin can select a cost center to configure | React state pattern from `/admin/cost-centers/payroll/` is the proven template |
| NAV-03 | Admin can see which cost center is currently selected at all times | Visual indicator pattern established in `CostCenterSelector` component; badge in page header |
| NAV-04 | Admin can quickly switch between cost centers | Card-grid selector (already exists in `CostCenterSelector`) re-used or adapted |
</phase_requirements>

---

## Summary

The `/admin/config` page currently fetches and writes `AdminConfig` rows with no `costCenterId` — it passes `null` for `costCenterId` in every upsert. The DB schema already supports per-CC config via a three-column unique key `(key, organizationId, costCenterId)`. No schema migration is needed; the gap is entirely in the API and UI layers.

The existing `/admin/cost-centers/payroll/` page (introduced in a recent PR) demonstrates the exact pattern needed: fetch cost centers from `/api/admin/cost-centers`, render a `CostCenterSelector` card-grid at the top, hold selected CC in React state, and re-fetch data whenever the selection changes. That selector component (`CostCenterSelector`) is already reusable and should be lifted into a shared location or copied directly.

The API route at `/api/admin/config` already accepts an optional `costCenterId` in principle (the Prisma upsert hardcodes `null` for it today), so extending it to accept a `costCenterId` query param (GET) and body field (PUT) is a targeted change. A fallback read (CC-specific row first, then org-wide row) must be implemented in the GET handler to satisfy the "fall back to org-wide defaults when no CC config exists" requirement.

**Primary recommendation:** Copy the `CostCenterSelector` UI pattern from `/admin/cost-centers/payroll/`, extend the `/api/admin/config` GET and PUT to thread `costCenterId`, implement fallback in GET, update the page to pass `costCenterId` on every fetch/save. No DB migration, no new tables.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.4 | App Router, route handlers | Already in use; `src/app/api/admin/config/route.ts` is a route handler |
| Prisma | (see schema) | ORM; `adminConfig.upsert` | `@@unique([key, organizationId, costCenterId])` already defined |
| React | (Next.js bundled) | Client state, `useState`/`useEffect` | Config page is `"use client"` |
| Zod | (existing) | Request body validation in route handlers | Used in `route.ts` today |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sonner `toast` | (existing) | User feedback on save | Used in config page for success/error toasts |
| lucide-react | (existing) | Icons | `Building2` or `ChevronDown` for CC selector label |
| shadcn/ui `Card`, `Button` | (existing) | UI primitives | All config section cards use these |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| React state for selected CC | URL query param `?cc=xxx` | Query param enables deep-linking and browser back — but adds complexity; React state simpler for MVP and all requirements are met |
| Inline CC selector on config page | Separate route per CC `/admin/config/[ccId]` | Separate route would require significant restructure; inline selector matches payroll page pattern already established |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(admin)/admin/config/
│   └── page.tsx              # existing — add CC selector at top, thread costCenterId
├── app/api/admin/config/
│   └── route.ts              # extend GET + PUT to accept costCenterId
└── components/admin/         # (optional) lift CostCenterSelector here if reused
```

The `CostCenterSelector` component currently lives at:
`src/app/(admin)/admin/cost-centers/payroll/components/cost-center-selector.tsx`

It can be imported directly from that path, or copied to a shared location. Given it will be used on two admin pages, lifting it to `src/components/admin/cost-center-selector.tsx` is recommended.

### Pattern 1: CC Selector + Re-fetch on Change (from payroll page)
**What:** Load cost centers once on mount; hold `selectedCC` in state; pass `selectedCC.id` to every data fetch as a query param.
**When to use:** Any admin page that needs per-CC scoping with React state.
**Example:**
```typescript
// Source: src/app/(admin)/admin/cost-centers/payroll/page.tsx (lines 27-42)
const [costCenters, setCostCenters] = useState<CostCenter[]>([])
const [selectedCC, setSelectedCC] = useState<CostCenter | null>(null)

useEffect(() => {
  async function loadCostCenters() {
    const res = await fetch("/api/admin/cost-centers")
    const data = await res.json()
    const centers = (Array.isArray(data) ? data : data.costCenters) || []
    setCostCenters(centers)
    if (centers.length > 0 && !selectedCC) {
      setSelectedCC(centers[0])  // auto-select first CC
    }
  }
  loadCostCenters()
}, [])
```

### Pattern 2: CostCenterSelector Card Grid (existing component)
**What:** A row of clickable cards, one per CC, with selected state highlighted in blue.
**When to use:** At the top of any page that configures per-CC data.
**Example:**
```typescript
// Source: src/app/(admin)/admin/cost-centers/payroll/components/cost-center-selector.tsx
<CostCenterSelector
  costCenters={costCenters}
  selectedCC={selectedCC}
  onSelect={setSelectedCC}
/>
```
The component renders a `border-blue-500 bg-blue-50` ring on the selected card and shows `code · countryCode · currency` metadata below the name. This satisfies NAV-03 (always-visible indicator) when placed at the page top.

### Pattern 3: API GET with costCenterId + Fallback
**What:** GET `/api/admin/config?costCenterId=xxx` returns CC-specific rows; for keys with no CC-specific row, falls back to the org-wide row (where `costCenterId IS NULL`).
**When to use:** Always when reading config for a selected CC.
**Implementation:**
```typescript
// Extend existing GET in src/app/api/admin/config/route.ts
const costCenterId = searchParams.get("costCenterId") // null = org-wide

// 1. Fetch CC-specific rows
const ccConfigs = costCenterId
  ? await prisma.adminConfig.findMany({
      where: { organizationId: scope.orgId, costCenterId },
      include: { updatedBy: { select: { id: true, name: true } } },
    })
  : []

// 2. Fetch org-wide rows (fallback)
const orgConfigs = await prisma.adminConfig.findMany({
  where: { organizationId: scope.orgId, costCenterId: null },
  include: { updatedBy: { select: { id: true, name: true } } },
})

// 3. Merge: CC-specific takes precedence over org-wide
const merged = new Map<string, typeof orgConfigs[0]>()
for (const c of orgConfigs) merged.set(c.key, c)
for (const c of ccConfigs) merged.set(c.key, c)  // overwrites org-wide
```

### Pattern 4: API PUT with costCenterId
**What:** PUT body `{ key, value, costCenterId }` — writes to the CC-specific row, never touching the org-wide row.
**When to use:** On every save action when a CC is selected.
**Example:**
```typescript
// Extend existing PUT in src/app/api/admin/config/route.ts
// Body schema already has organizationId; add costCenterId:
const parsed = z.object({
  key: z.string(),
  value: z.unknown(),
  organizationId: z.string().nullable().optional(),
  costCenterId: z.string().nullable().optional(),  // NEW
}).safeParse(body)

// Pass to upsert:
await prisma.adminConfig.upsert({
  where: {
    key_organizationId_costCenterId: {
      key,
      organizationId: scope.orgId ?? null as unknown as string,
      costCenterId: costCenterId ?? null as unknown as string,  // was hardcoded null
    },
  },
  create: { key, organizationId: scope.orgId, costCenterId: costCenterId ?? null, value: ..., updatedById: ... },
  update: { value: ..., updatedById: ... },
})
```

**CRITICAL:** The Prisma unique constraint name used in the existing `route.ts` is `key_organizationId_costCenterId` (auto-generated from the field names). The schema has `@@unique([key, organizationId, costCenterId], map: "AdminConfig_key_org_cc_key")` — the `map` is the DB index name, but Prisma's generated client uses the default compound name `key_organizationId_costCenterId`. The existing code already uses this name correctly; do not change it.

### Pattern 5: Page-level saveConfig wrapper with costCenterId
**What:** Thread `selectedCC?.id` into the existing `saveConfig(key, value)` helper.
**Example:**
```typescript
// In config page.tsx — modify saveConfig to accept costCenterId
async function saveConfig(key: string, value: unknown, costCenterId: string | null): Promise<boolean> {
  const res = await fetch("/api/admin/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value, costCenterId }),
  })
  // ... rest unchanged
}

// All save handlers:
const ok = await saveConfig("approvalCommittee", committee, selectedCC?.id ?? null)
```

### Anti-Patterns to Avoid
- **Passing costCenterId as undefined instead of null:** The Prisma unique key treats `undefined` and `null` differently. Always pass `null` explicitly for org-wide rows.
- **Loading all keys at once without fallback:** If CC-specific rows don't exist yet, the page shows blank values. Always merge CC rows over org-wide rows.
- **Re-fetching cost center list on every CC switch:** Fetch cost centers once on mount, not on `selectedCC` change.
- **Saving costCenterId into the org-wide row:** When `selectedCC` is null, the save must pass `costCenterId: null` — do not default to the org-wide row by accident.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cost center dropdown | Custom select with CC data fetching | Reuse `CostCenterSelector` component from payroll page | Already handles inactive state, responsive grid, selection highlight |
| CC-config fallback resolution | Hand-written merge in the page component | Server-side merge in route GET handler | Keeps client simple; fallback is a concern of data access, not display |
| Prisma upsert for compound key | Manual findUnique + create/update | `prisma.adminConfig.upsert` with `where: { key_organizationId_costCenterId: {...} }` | Already used in route.ts; handles race conditions |

**Key insight:** The entire pattern (CC list fetch, card selector, per-CC data fetch, fallback) is already implemented for payroll. This phase is largely wiring — not invention.

---

## Common Pitfalls

### Pitfall 1: Prisma null in compound unique key
**What goes wrong:** `null` values in compound unique constraints behave as NOT DISTINCT in Postgres 15+ but as always-distinct in older Postgres. The existing code casts `null as unknown as string` to satisfy TypeScript — this is intentional and must be preserved.
**Why it happens:** TypeScript's strict null types conflict with Prisma's compound key `where` clause when fields are optional.
**How to avoid:** Copy the existing cast pattern: `costCenterId: null as unknown as string` for org-wide rows.
**Warning signs:** TypeScript error "Type 'null' is not assignable to type 'string'" in the `where` clause of `upsert`.

### Pitfall 2: Empty config on first CC selection
**What goes wrong:** A brand-new CC has no `AdminConfig` rows. The GET returns an empty `configs` object. The page resets all form fields to hardcoded defaults (e.g., `submissionDeadline: 25`) instead of showing org-wide values.
**Why it happens:** The current `loadData` function sets state only `if (c.approvalCommittee)` — it does nothing when the key is absent.
**How to avoid:** Implement the merge-with-org-wide-fallback in the API GET handler (Pattern 3 above). The page then always receives populated values.
**Warning signs:** Switching to a new CC shows "No approvers configured" even when the org-wide config has approvers set.

### Pitfall 3: Stale config after CC switch
**What goes wrong:** User switches from CC A to CC B; UI still shows CC A's data for a moment (or forever if `useEffect` dependency is wrong).
**Why it happens:** The `loadData` callback's `useCallback` deps do not include `selectedCC?.id`.
**How to avoid:** Call `loadData()` (or a new `loadConfigForCC(ccId)`) in a `useEffect` that depends on `[selectedCC?.id]`.
**Warning signs:** Switching CCs does not trigger a new `/api/admin/config?costCenterId=...` request (verifiable in browser DevTools Network tab).

### Pitfall 4: Saving to wrong CC after rapid switching
**What goes wrong:** User clicks CC A, then quickly clicks CC B. The CC A fetch completes, populates form. User edits and saves — save reads `selectedCC` from closure which may still be CC A.
**Why it happens:** Async fetch + closure capture of `selectedCC` at time of callback creation.
**How to avoid:** Pass `selectedCC` as a parameter into save handlers at call time, not captured in closure. Or use a ref: `const selectedCCRef = useRef(selectedCC); useEffect(() => { selectedCCRef.current = selectedCC }, [selectedCC])`.

### Pitfall 5: `resolveScope` does not account for costCenterId ownership
**What goes wrong:** An ADMIN passes a `costCenterId` that belongs to a different org.
**Why it happens:** The existing `resolveScope` only validates `organizationId`, not `costCenterId`.
**How to avoid:** After resolving `orgId`, verify the requested `costCenterId` belongs to that org before using it: `prisma.costCenter.findFirst({ where: { id: costCenterId, organizationId: orgId } })`. Return 403 if not found.

---

## Code Examples

### Fetching CC list (already works, no change needed)
```typescript
// Source: src/app/(admin)/admin/cost-centers/payroll/page.tsx line 30
const res = await fetch("/api/admin/cost-centers")
const data = await res.json()
const centers = (Array.isArray(data) ? data : data.costCenters) || []
// Note: API returns { costCenters: [...] } shape (not a raw array)
```

### Fetching config for a selected CC
```typescript
// Extended call in config page.tsx
const configRes = await fetch(
  `/api/admin/config${selectedCC ? `?costCenterId=${selectedCC.id}` : ""}`
)
```

### AdminConfig unique constraint (existing in schema.prisma line 392)
```prisma
@@unique([key, organizationId, costCenterId], map: "AdminConfig_key_org_cc_key")
```
The Prisma client exposes this as `key_organizationId_costCenterId` for `where` clause usage.

### Visual "currently editing" indicator
```tsx
// Minimal badge beneath page title — satisfies NAV-03
{selectedCC && (
  <div className="flex items-center gap-2 text-sm text-blue-700 font-medium">
    <Building2 className="h-4 w-4" />
    Configuring: {selectedCC.name}
    <span className="text-gray-400 text-xs font-normal">({selectedCC.code})</span>
  </div>
)}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Org-wide config only | Per-CC `costCenterId` column in `AdminConfig` | Already in schema | DB layer ready; only API + UI gap |
| No CC selector in admin pages | `CostCenterSelector` card-grid pattern | Introduced in payroll page (PR ~5788bb9) | Pattern to follow for config page |
| Single GET ignoring `costCenterId` | Parameterized GET with fallback merge | This phase | Enables true per-CC configuration |

**Deprecated/outdated:**
- Hardcoded `costCenterId: null as unknown as string` in PUT: This will be replaced by dynamic `costCenterId` from request body. The cast syntax is still needed, just with the dynamic value.

---

## Open Questions

1. **Should org-wide config remain editable after per-CC scoping is added?**
   - What we know: Org-wide rows are the fallback source; currently the only rows that exist.
   - What's unclear: Should the admin be able to explicitly edit "org-wide defaults" separately from per-CC config? Roadmap says "fallback to org-wide when no CC-specific override exists" — but does the UI need an "Org-wide defaults" mode?
   - Recommendation: For Phase 1, only support CC-specific editing (the active CC is always selected). The org-wide rows become read-only fallbacks populated by existing data. Add "org-wide defaults" editing in a later phase if needed.

2. **Auto-select behavior: first CC or none?**
   - What we know: Payroll page auto-selects the first CC (`if (centers.length > 0 && !selectedCC) setSelectedCC(centers[0])`).
   - What's unclear: For config, auto-selecting CC A immediately loads CC A's data — unexpected if admin intended to edit org-wide defaults.
   - Recommendation: Auto-select the first CC (consistent with payroll page pattern). Show a "No cost centers configured" empty state if the list is empty.

3. **What happens to existing org-wide `AdminConfig` rows?**
   - What we know: Existing rows have `costCenterId = null`. They continue to exist and serve as fallbacks.
   - What's unclear: Whether existing data creates a data collision risk.
   - Recommendation: No collision risk. The unique key `(key, organizationId, null)` is distinct from `(key, organizationId, cc-id)`. Existing rows remain the org-wide fallback. No migration needed.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (detected via `vitest.config.ts`) |
| Config file | `vitest.config.ts` — `test.include: ["src/**/*.test.ts"]` |
| Quick run command | `npx vitest run src/lib/config-scoping.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAV-01 | CC list loads from `/api/admin/cost-centers` | manual (UI) | — | N/A |
| NAV-02 | Selecting CC re-fetches config with `?costCenterId=` | manual (UI) | — | N/A |
| NAV-03 | Selected CC name visible at all times in header | manual (UI) | — | N/A |
| NAV-04 | Switching CC triggers re-fetch (no stale data) | manual (UI) | — | N/A |
| API GET fallback | CC-specific row overrides org-wide for same key | unit | `npx vitest run src/lib/config-scoping.test.ts` | ❌ Wave 0 |
| API GET merge | Keys absent in CC use org-wide row value | unit | `npx vitest run src/lib/config-scoping.test.ts` | ❌ Wave 0 |
| API PUT scope | Saving writes CC-specific row, not org-wide row | unit | `npx vitest run src/lib/config-scoping.test.ts` | ❌ Wave 0 |
| CC ownership | Passing foreign `costCenterId` returns 403 | unit | `npx vitest run src/lib/config-scoping.test.ts` | ❌ Wave 0 |

**Note:** NAV-01 through NAV-04 are UI/navigation behaviors verified manually. The testable logic is the fallback merge algorithm and CC ownership validation — these should be extracted to a pure function in `src/lib/config-scoping.ts` and unit-tested.

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/config-scoping.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/config-scoping.ts` — extract pure `mergeConfigs(ccRows, orgRows)` and `validateCCOwnership(costCenterId, orgId)` functions
- [ ] `src/lib/config-scoping.test.ts` — unit tests for merge fallback and ownership check

---

## Sources

### Primary (HIGH confidence)
- Direct inspection: `src/app/api/admin/config/route.ts` — full API logic, Prisma upsert, scope resolution
- Direct inspection: `prisma/schema.prisma` (lines 375–394) — `AdminConfig` model with `costCenterId`, unique constraint
- Direct inspection: `src/app/(admin)/admin/config/page.tsx` — current client state, fetch pattern, all section cards
- Direct inspection: `src/app/(admin)/admin/cost-centers/payroll/page.tsx` — CC selector pattern, CC list fetch, re-fetch on CC change
- Direct inspection: `src/app/(admin)/admin/cost-centers/payroll/components/cost-center-selector.tsx` — reusable selector component
- Direct inspection: `src/app/api/admin/cost-centers/route.ts` — CC list API shape `{ costCenters: [...] }`
- Direct inspection: `vitest.config.ts` — test framework configuration

### Secondary (MEDIUM confidence)
- Prisma docs (general knowledge): compound unique `where` clause syntax and null handling behavior
- Next.js 16 route handlers: The codebase uses `export async function GET(request: Request)` pattern — consistent with Next.js App Router route handlers

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries identified from existing code, no new dependencies needed
- Architecture patterns: HIGH — patterns cloned directly from existing payroll page implementation
- Pitfalls: HIGH — null handling in Prisma compound keys verified from existing `route.ts` code; closure capture pitfall from general React patterns (MEDIUM for that specific item)

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (stable codebase, no external dependencies changing)
