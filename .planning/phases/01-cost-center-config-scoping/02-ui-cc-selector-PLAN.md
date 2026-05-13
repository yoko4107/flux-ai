---
phase: 01-cost-center-config-scoping
plan: 02
type: execute
wave: 2
depends_on:
  - 01-api-extension-PLAN.md
files_modified:
  - src/components/admin/CostCenterSelector.tsx
  - src/app/(admin)/admin/config/page.tsx
autonomous: false
requirements:
  - NAV-02
  - NAV-03
  - NAV-04

must_haves:
  truths:
    - "Admin sees a cost center selector at the top of the /admin/config page"
    - "Auto-selecting the first CC on page load triggers a config fetch with that CC's ID"
    - "Selecting a different CC re-fetches all config sections with the new costCenterId"
    - "The currently selected CC name is visible at all times while editing config"
    - "Saving any config section writes costCenterId of the selected CC, not null"
    - "Switching CCs does not show stale data from the previous CC"
  artifacts:
    - path: "src/components/admin/CostCenterSelector.tsx"
      provides: "Shared CostCenterSelector card-grid component"
      exports: ["CostCenterSelector"]
    - path: "src/app/(admin)/admin/config/page.tsx"
      provides: "Updated config page with CC selector, selectedCC state, re-fetch on CC change, costCenterId in all save calls"
      contains: "selectedCC"
  key_links:
    - from: "src/app/(admin)/admin/config/page.tsx"
      to: "src/components/admin/CostCenterSelector.tsx"
      via: "import CostCenterSelector from shared location"
      pattern: "from.*components/admin/CostCenterSelector"
    - from: "src/app/(admin)/admin/config/page.tsx loadData"
      to: "/api/admin/config?costCenterId="
      via: "fetch with selectedCC.id in query string"
      pattern: "fetch.*api/admin/config.*costCenterId"
    - from: "src/app/(admin)/admin/config/page.tsx saveConfig"
      to: "/api/admin/config PUT body"
      via: "costCenterId field in JSON body"
      pattern: "costCenterId.*selectedCC"
    - from: "useEffect on selectedCC?.id"
      to: "loadData()"
      via: "dependency array includes selectedCC?.id"
      pattern: "useEffect.*selectedCC"
---

<objective>
Add a cost center selector to the `/admin/config` page and wire all config reads and writes to the currently selected cost center.

Purpose: Without this UI layer, the API extension in Plan 01 is unreachable from the admin UI. This plan makes per-CC configuration accessible to admins and fulfills NAV-02, NAV-03, and NAV-04.

Output: A shared `CostCenterSelector` component and an updated config page where every section reads from and writes to the selected CC.
</objective>

<execution_context>
@/Users/yokosimon/.claude/get-shit-done/workflows/execute-plan.md
@/Users/yokosimon/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/01-cost-center-config-scoping/01-RESEARCH.md
@.planning/phases/01-cost-center-config-scoping/01-api-extension-SUMMARY.md

<!-- Key interfaces the executor needs — no codebase exploration required -->
<interfaces>
Source component to copy/lift (src/app/(admin)/admin/cost-centers/payroll/components/cost-center-selector.tsx):
```typescript
type CostCenter = {
  id: string
  code: string
  name: string
  countryCode: string
  currency: string
  active: boolean
}

export function CostCenterSelector({
  costCenters,
  selectedCC,
  onSelect,
}: {
  costCenters: CostCenter[]
  selectedCC: CostCenter | null
  onSelect: (cc: CostCenter) => void
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <label className="text-xs font-semibold text-gray-700 block mb-2">Select cost center</label>
      <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4">
        {costCenters.map((cc) => (
          <button
            key={cc.id}
            onClick={() => onSelect(cc)}
            className={`rounded-lg border-2 p-3 text-left transition-all ${
              selectedCC?.id === cc.id
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 bg-white hover:border-gray-300"
            } ${!cc.active ? "opacity-50" : ""}`}
          >
            <div className="font-medium text-sm text-gray-900">{cc.name}</div>
            <div className="text-xs text-gray-500 mt-1">
              {cc.code} · {cc.countryCode} · {cc.currency}
            </div>
            {!cc.active && (
              <div className="text-xs text-amber-600 mt-1 font-medium">Inactive</div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
```

CC list fetch pattern (from payroll page — API returns { costCenters: [...] }):
```typescript
const res = await fetch("/api/admin/cost-centers")
const data = await res.json()
const centers = (Array.isArray(data) ? data : data.costCenters) || []
setCostCenters(centers)
if (centers.length > 0 && !selectedCC) {
  setSelectedCC(centers[0])  // auto-select first
}
```

Extended saveConfig signature (from Plan 01 API):
```typescript
// PUT body now accepts costCenterId
{ key, value, costCenterId: string | null }
```

Extended GET signature (from Plan 01 API):
```typescript
// GET accepts optional costCenterId query param
fetch(`/api/admin/config${selectedCC ? `?costCenterId=${selectedCC.id}` : ""}`)
```

Active CC indicator pattern (from research):
```tsx
{selectedCC && (
  <div className="flex items-center gap-2 text-sm text-blue-700 font-medium">
    <Building2 className="h-4 w-4" />
    Configuring: {selectedCC.name}
    <span className="text-gray-400 text-xs font-normal">({selectedCC.code})</span>
  </div>
)}
```

Stale-data prevention: useEffect must depend on selectedCC?.id:
```typescript
useEffect(() => {
  if (selectedCC) loadData()
}, [selectedCC?.id])  // re-fetches when CC changes
```

Save closure pitfall fix — pass costCenterId at call time:
```typescript
async function saveConfig(key: string, value: unknown, costCenterId: string | null): Promise<boolean> {
  const res = await fetch("/api/admin/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value, costCenterId }),
  })
  // ...
}
// All call sites:
const ok = await saveConfig("approvalCommittee", committee, selectedCC?.id ?? null)
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create shared CostCenterSelector component</name>
  <files>src/components/admin/CostCenterSelector.tsx</files>
  <action>
    Create `src/components/admin/CostCenterSelector.tsx` by copying the component from `src/app/(admin)/admin/cost-centers/payroll/components/cost-center-selector.tsx` exactly, with these two additions:

    1. Export the `CostCenter` type so importing pages do not need to redeclare it:
    ```typescript
    export type CostCenter = {
      id: string
      code: string
      name: string
      countryCode: string
      currency: string
      active: boolean
    }
    ```

    2. Add a `"use client"` directive at the top of the file (the component uses onClick).

    The component body itself is unchanged from the source. Do NOT delete the original at the payroll path — other pages import from there. The shared location is additive.

    Verify the file compiles: `npx tsc --noEmit`
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
    `src/components/admin/CostCenterSelector.tsx` exists, exports both `CostCenter` type and `CostCenterSelector` function, compiles clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire CC selector and re-fetch into config page</name>
  <files>src/app/(admin)/admin/config/page.tsx</files>
  <action>
    Update `src/app/(admin)/admin/config/page.tsx` with the following changes. Preserve all existing section cards — only add the CC selector layer and update data flow.

    **New imports to add at top:**
    ```typescript
    import { CostCenterSelector, type CostCenter } from "@/components/admin/CostCenterSelector"
    import { Building2 } from "lucide-react"
    ```
    (Building2 may already be imported — check and add only if missing.)

    **New state variables to add inside AdminConfigPage (alongside existing state):**
    ```typescript
    const [costCenters, setCostCenters] = useState<CostCenter[]>([])
    const [selectedCC, setSelectedCC] = useState<CostCenter | null>(null)
    const [loadingCCs, setLoadingCCs] = useState(true)
    ```

    **Load cost centers once on mount (separate from config loadData):**
    Add a new useEffect that runs once on mount:
    ```typescript
    useEffect(() => {
      async function loadCostCenters() {
        setLoadingCCs(true)
        try {
          const res = await fetch("/api/admin/cost-centers")
          const data = await res.json()
          const centers = (Array.isArray(data) ? data : data.costCenters) || []
          setCostCenters(centers)
          if (centers.length > 0) {
            setSelectedCC(centers[0])  // auto-select first CC
          }
        } finally {
          setLoadingCCs(false)
        }
      }
      loadCostCenters()
    }, [])  // empty deps — runs once
    ```

    **Update loadData to accept and pass costCenterId:**
    Change the existing `loadData` useCallback to accept the selected CC's ID:
    ```typescript
    const loadData = useCallback(async (ccId: string | null) => {
      setLoading(true)
      try {
        const [configRes, usersRes] = await Promise.all([
          fetch(`/api/admin/config${ccId ? `?costCenterId=${ccId}` : ""}`),
          fetch("/api/admin/users"),
        ])
        // ... rest of loadData body unchanged
      }
    }, [])
    ```

    **Add useEffect that re-fetches config when selectedCC changes:**
    Replace the existing `useEffect(() => { loadData() }, [loadData])` with:
    ```typescript
    useEffect(() => {
      if (selectedCC !== undefined) {  // only after CC state is initialized
        loadData(selectedCC?.id ?? null)
      }
    }, [selectedCC?.id, loadData])
    ```
    Note: `selectedCC` starts as `null` (before CC list loads) then is set to first CC. The effect fires on the first CC selection too — this is intentional.

    **Update saveConfig to accept and send costCenterId:**
    ```typescript
    async function saveConfig(key: string, value: unknown, costCenterId: string | null): Promise<boolean> {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value, costCenterId }),
      })
      // rest unchanged
    }
    ```

    **Update every saveConfig call site to pass selectedCC?.id ?? null:**
    - `handleSaveCommittee`: `saveConfig("approvalCommittee", committee, selectedCC?.id ?? null)`
    - `handleSaveDeadlines`: both calls `saveConfig("submissionDeadline", ..., selectedCC?.id ?? null)` and `saveConfig("approvalDeadline", ..., selectedCC?.id ?? null)`
    - `handleSaveMaxAmounts`: `saveConfig("maxAmountPerCategory", maxAmounts, selectedCC?.id ?? null)`
    - `handleSaveReceipt`: `saveConfig("requireReceiptAbove", requireReceiptAbove, selectedCC?.id ?? null)`
    - `handleSaveCategories`: `saveConfig("allowedCategories", allowedCategories, selectedCC?.id ?? null)`
    - `handleSaveNotif`: `saveConfig("notificationChannels", notifChannels, selectedCC?.id ?? null)`
    - `handleSaveResubmit`: `saveConfig("resubmitBehavior", resubmitBehavior, selectedCC?.id ?? null)`

    **Update the JSX return to add CC selector and indicator above all section cards:**
    In the `return` block, immediately after `<h1 className="text-2xl font-bold">System Configuration</h1>`, insert:

    ```tsx
    {/* Cost Center Selector */}
    {loadingCCs ? (
      <div className="text-sm text-gray-400">Loading cost centers...</div>
    ) : costCenters.length === 0 ? (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        No cost centers configured. <a href="/admin/cost-centers" className="underline">Add a cost center</a> to begin per-CC configuration.
      </div>
    ) : (
      <>
        <CostCenterSelector
          costCenters={costCenters}
          selectedCC={selectedCC}
          onSelect={setSelectedCC}
        />
        {selectedCC && (
          <div className="flex items-center gap-2 text-sm text-blue-700 font-medium bg-blue-50 rounded-lg px-4 py-2 border border-blue-100">
            <Building2 className="h-4 w-4 shrink-0" />
            Configuring: <span className="font-semibold">{selectedCC.name}</span>
            <span className="text-gray-400 text-xs font-normal">({selectedCC.code})</span>
          </div>
        )}
      </>
    )}
    ```

    Ensure the existing `if (loading)` early-return remains for the config data loading state. The CC-loading state (`loadingCCs`) is handled inline above — do not block the whole page on it.

    TypeScript must compile clean: `npx tsc --noEmit`
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run</automated>
  </verify>
  <done>
    - `src/app/(admin)/admin/config/page.tsx` imports CostCenterSelector from shared path
    - CC selector renders above all section cards on /admin/config
    - selectedCC state initializes to first CC on mount
    - useEffect on selectedCC?.id triggers config re-fetch with ?costCenterId= param
    - All 7 saveConfig call sites pass selectedCC?.id ?? null as costCenterId
    - Active CC indicator (Building2 icon + name + code) visible below selector
    - TypeScript compiles clean; full test suite green
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Human verify — CC selector and scoped saves end-to-end</name>
  <what-built>
    Cost center selector on /admin/config page that scopes all reads and writes to the selected CC. The API (Plan 01) and UI (Plan 02) are now wired end-to-end.
  </what-built>
  <how-to-verify>
    1. Navigate to /admin/config
    2. Verify: a card-grid CC selector appears at the top (NAV-01, NAV-02)
    3. Verify: the first CC is auto-selected and its name + code appear in the blue indicator bar below the selector (NAV-03)
    4. Open browser DevTools Network tab, filter by "config"
    5. Switch to a different CC card — verify a new GET request fires to /api/admin/config?costCenterId={id} (NAV-04, no stale data)
    6. Edit any field (e.g., change submission deadline) and click Save
    7. In DevTools Network, inspect the PUT request body — verify `costCenterId` is present and matches the selected CC's id (not null)
    8. Switch to a CC that has no config set yet — verify the page shows org-wide defaults instead of blank fields (fallback merge working)
    9. Verify no console errors
  </how-to-verify>
  <action>Run dev server (`npm run dev`) and manually verify the CC selector and scoped save behaviors listed in how-to-verify above.</action>
  <verify>Human confirms all 9 steps in how-to-verify pass.</verify>
  <done>Admin can select a CC, see its name in the indicator, switch CCs with re-fetch, and save config scoped to the selected CC.</done>
  <resume-signal>Type "approved" if all checks pass, or describe which step failed</resume-signal>
</task>

</tasks>

<verification>
Full test suite green: `npx vitest run`
TypeScript compiles: `npx tsc --noEmit`
Human checkpoint confirms:
  - CC selector visible at top of /admin/config
  - Switching CC triggers new fetch with costCenterId query param
  - Save writes include costCenterId in request body
  - Blue indicator bar shows selected CC name at all times
  - Empty-CC state shows helpful link to /admin/cost-centers
</verification>

<success_criteria>
1. `src/components/admin/CostCenterSelector.tsx` exists and exports CostCenter type + CostCenterSelector function
2. `/admin/config` page renders CostCenterSelector card-grid above all section cards
3. First CC is auto-selected on page load; config fetched for that CC immediately
4. Clicking a different CC card triggers re-fetch — Network tab shows new ?costCenterId= request
5. Blue indicator bar shows "Configuring: [CC Name] (code)" at all times after first CC selected
6. All 7 save handlers include costCenterId matching the selected CC in PUT request body
7. TypeScript compiles clean; all existing tests pass
</success_criteria>

<output>
After completion, create `.planning/phases/01-cost-center-config-scoping/02-ui-cc-selector-SUMMARY.md`
</output>
