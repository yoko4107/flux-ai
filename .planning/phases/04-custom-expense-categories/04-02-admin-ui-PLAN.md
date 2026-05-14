---
phase: 04-custom-expense-categories
plan: 02
type: execute
wave: 2
depends_on:
  - 04-01-backend-PLAN.md
files_modified:
  - src/app/(admin)/admin/config/page.tsx
autonomous: true
requirements:
  - CATG-01
  - CATG-02
  - CATG-03

must_haves:
  truths:
    - "Admin sees a 'Custom Categories' SectionCard on the config page listing current custom entries for the selected CC"
    - "Admin can add a new custom category by entering a name and code, then saving"
    - "Admin can toggle a custom category enabled/disabled and save the change"
    - "Admin can rename an existing custom category and save the change"
    - "The 12 default categories are still visible in the existing Allowed Categories section"
    - "Custom category state resets when the admin switches to a different cost center"
  artifacts:
    - path: "src/app/(admin)/admin/config/page.tsx"
      provides: "customCategories state + SectionCard UI for CRUD + loadData hydration + save handler"
      contains: "customCategories"
  key_links:
    - from: "src/app/(admin)/admin/config/page.tsx"
      to: "/api/admin/config"
      via: "saveConfig('customCategories', customCategories, selectedCC?.id ?? null)"
      pattern: "customCategories"
    - from: "src/app/(admin)/admin/config/page.tsx"
      to: "src/lib/custom-categories.ts"
      via: "CustomCategory type import"
      pattern: "CustomCategory"
---

<objective>
Add the Custom Categories SectionCard to the admin config page.

Purpose: Admins need a UI to view, add, rename, and toggle custom expense categories per cost center. This plan adds the CustomCategory state, the SectionCard form, and wires it to the existing saveConfig() and loadData() patterns established in prior phases.

Output:
- src/app/(admin)/admin/config/page.tsx extended with:
  - CustomCategory type import from @/lib/custom-categories
  - customCategories + savingCustomCategories state
  - loadData() hydration block for customCategories
  - handleSaveCustomCategories() handler
  - SectionCard "Custom Categories" with add/rename/toggle/remove row UI
</objective>

<execution_context>
@/Users/yokosimon/.claude/get-shit-done/workflows/execute-plan.md
@/Users/yokosimon/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/04-custom-expense-categories/04-RESEARCH.md
@.planning/phases/04-custom-expense-categories/04-01-SUMMARY.md

<interfaces>
<!-- Key contracts from the existing config page and the new Plan 01 output -->

From src/app/(admin)/admin/config/page.tsx — existing patterns to follow exactly:

SectionCard component signature (already defined in the file, do not redefine):
```tsx
function SectionCard({
  title, metaKey, meta, onSave, saving, children
}: {
  title: string; metaKey: string; meta: Record<string, ConfigMeta>;
  onSave: () => void; saving: boolean; children: React.ReactNode
})
```

saveConfig helper (already defined in the file):
```typescript
async function saveConfig(key: string, value: unknown, costCenterId: string | null): Promise<boolean>
```

State pattern to follow (see existing allowedCategories block ~line 373):
```typescript
const [allowedCategories, setAllowedCategories] = useState<string[]>(["TRAVEL", "MEALS", "SUPPLIES", "OTHER"])
const [savingCategories, setSavingCategories] = useState(false)
```

loadData hydration pattern (see ~line 459):
```typescript
if (Array.isArray(c.allowedCategories)) {
  setAllowedCategories(c.allowedCategories as string[])
}
// ADD after existing hydration blocks:
if (Array.isArray(c.customCategories)) {
  setCustomCategories(c.customCategories as CustomCategory[])
} else {
  setCustomCategories([]) // reset on CC switch
}
```

From src/lib/custom-categories.ts (output of Plan 01):
```typescript
export interface CustomCategory {
  name: string    // display name, e.g. "Conference Fees"
  code: string    // uppercase alphanumeric+underscore, e.g. "CONF_FEES"
  enabled: boolean
}
```

Validation constraints for the add form (from Zod schema — enforce in UI):
- name: 1–60 chars, non-empty
- code: 1–30 chars, only uppercase letters, digits, underscores (/^[A-Z0-9_]+$/)
- code must not duplicate an existing custom entry's code or any of the 12 defaults
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add customCategories state, hydration, and save handler</name>
  <files>src/app/(admin)/admin/config/page.tsx</files>
  <action>
    Read the AGENTS.md instruction: check node_modules/next/dist/docs/ for any breaking changes relevant to useState/useCallback patterns before editing.

    1. Add import at the top of the file:
       ```typescript
       import type { CustomCategory } from "@/lib/custom-categories"
       ```

    2. Add state declarations in the AdminConfigPage component body, grouped with the other section states (~line 386):
       ```typescript
       // Custom Categories
       const [customCategories, setCustomCategories] = useState<CustomCategory[]>([])
       const [savingCustomCategories, setSavingCustomCategories] = useState(false)
       ```

    3. In the `loadData` callback, AFTER the `if (c.resubmitBehavior)` block, add:
       ```typescript
       if (Array.isArray(c.customCategories)) {
         setCustomCategories(c.customCategories as CustomCategory[])
       } else {
         setCustomCategories([])
       }
       ```
       The `else` branch ensures state resets to empty when switching to a CC with no custom categories.

    4. Add the save handler function alongside the other `handleSave*` functions (~line 605):
       ```typescript
       async function handleSaveCustomCategories() {
         setSavingCustomCategories(true)
         const ok = await saveConfig("customCategories", customCategories, selectedCC?.id ?? null)
         if (ok) toast.success("Custom categories saved")
         else toast.error("Failed to save custom categories")
         setSavingCustomCategories(false)
       }
       ```

    5. Run TypeScript check:
       `npx tsc --noEmit 2>&1 | grep "admin/config"`
       Fix any type errors before proceeding.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -c "admin/config" | { read n; [ "$n" -eq 0 ] && echo "OK" || echo "ERRORS: $n"; }</automated>
  </verify>
  <done>No TypeScript errors in admin/config/page.tsx. customCategories state, loadData hydration, and handleSaveCustomCategories() are present in the file.</done>
</task>

<task type="auto">
  <name>Task 2: Add Custom Categories SectionCard UI with add/rename/toggle/remove</name>
  <files>src/app/(admin)/admin/config/page.tsx</files>
  <action>
    Add the SectionCard JSX for Custom Categories in the return block, AFTER the existing "Allowed Categories" SectionCard. Use the existing SectionCard component (defined at the top of the file — do NOT redefine it).

    The SectionCard needs:
    - An inline "add row" form at the bottom: two inputs (name, code) + an "Add" button
    - A list of existing custom entries: each row shows name + code, an enabled toggle, and a remove button
    - Client-side validation before adding: name non-empty, code matches /^[A-Z0-9_]+$/, code unique vs existing custom entries and 12 defaults

    Implementation pattern:

    ```tsx
    {/* 9. Custom Categories */}
    <SectionCard
      title="Custom Categories"
      metaKey="customCategories"
      meta={meta}
      onSave={handleSaveCustomCategories}
      saving={savingCustomCategories}
    >
      <p className="text-xs text-gray-500">
        Add categories beyond the 12 defaults. Custom codes must be uppercase letters, digits, and underscores (e.g. CONF_FEES).
      </p>

      {/* Existing custom category rows */}
      {customCategories.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No custom categories yet.</p>
      ) : (
        <ul className="space-y-2">
          {customCategories.map((cat, idx) => (
            <li key={cat.code} className="flex items-center gap-2 rounded-md border px-3 py-2">
              <input
                type="checkbox"
                checked={cat.enabled}
                onChange={(e) =>
                  setCustomCategories((prev) =>
                    prev.map((c, i) => i === idx ? { ...c, enabled: e.target.checked } : c)
                  )
                }
                title="Enable/disable"
              />
              <input
                type="text"
                value={cat.name}
                onChange={(e) =>
                  setCustomCategories((prev) =>
                    prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c)
                  )
                }
                maxLength={60}
                className="flex-1 text-sm border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1"
                placeholder="Category name"
              />
              <span className="text-xs text-gray-400 font-mono">{cat.code}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                onClick={() =>
                  setCustomCategories((prev) => prev.filter((_, i) => i !== idx))
                }
                title="Remove"
              >
                <X className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Add new category form */}
      <AddCustomCategoryRow
        existingCodes={[
          ...CATEGORIES,
          ...customCategories.map((c) => c.code),
        ]}
        onAdd={(cat) => setCustomCategories((prev) => [...prev, cat])}
      />
    </SectionCard>
    ```

    Define `AddCustomCategoryRow` as a local component INSIDE the file, ABOVE the `AdminConfigPage` component (not inside it, to avoid re-creation on render):

    ```tsx
    function AddCustomCategoryRow({
      existingCodes,
      onAdd,
    }: {
      existingCodes: readonly string[]
      onAdd: (cat: CustomCategory) => void
    }) {
      const [name, setName] = useState("")
      const [code, setCode] = useState("")
      const [error, setError] = useState<string | null>(null)

      function handleAdd() {
        const trimmedName = name.trim()
        const trimmedCode = code.trim().toUpperCase()
        if (!trimmedName) { setError("Name is required"); return }
        if (!trimmedCode || !/^[A-Z0-9_]+$/.test(trimmedCode)) {
          setError("Code must be uppercase letters, digits, and underscores only")
          return
        }
        if (trimmedCode.length > 30) { setError("Code too long (max 30 chars)"); return }
        if (existingCodes.includes(trimmedCode)) {
          setError(`Code "${trimmedCode}" already exists`)
          return
        }
        setError(null)
        onAdd({ name: trimmedName, code: trimmedCode, enabled: true })
        setName("")
        setCode("")
      }

      return (
        <div className="space-y-1 pt-2 border-t">
          <div className="flex gap-2">
            <Input
              placeholder="Name (e.g. Conference Fees)"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null) }}
              maxLength={60}
              className="flex-1 h-8 text-sm"
            />
            <Input
              placeholder="Code (e.g. CONF_FEES)"
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null) }}
              maxLength={30}
              className="w-36 h-8 text-sm font-mono"
            />
            <Button size="sm" variant="outline" className="h-8" onClick={handleAdd}>
              Add
            </Button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )
    }
    ```

    Note: `AddCustomCategoryRow` uses its own `useState` — ensure it is placed where React hooks are valid (a function component body, not inside a render callback).

    After adding the JSX, run the full test suite and TypeScript check.
  </action>
  <verify>
    <automated>npm test -- --run && npx tsc --noEmit 2>&1 | grep -c "error TS" | { read n; [ "$n" -eq 0 ] && echo "TYPE OK" || echo "TYPE ERRORS: $n"; }</automated>
  </verify>
  <done>Full test suite passes. TypeScript compiles with 0 errors. The Custom Categories SectionCard is present in the JSX return. Admin can add, rename, toggle, and remove entries from state before saving.</done>
</task>

</tasks>

<verification>
Run full suite: `npm test -- --run`

TypeScript check: `npx tsc --noEmit`

Structural checks:
- `grep -n "Custom Categories" src/app/(admin)/admin/config/page.tsx` — SectionCard title present
- `grep -n "customCategories" src/app/(admin)/admin/config/page.tsx` — state, hydration, save handler, JSX prop
- `grep -n "AddCustomCategoryRow" src/app/(admin)/admin/config/page.tsx` — component defined and used
- `grep -n "CustomCategory" src/app/(admin)/admin/config/page.tsx` — type imported from @/lib/custom-categories

Manual verification (after deploy or `npm run dev`):
1. Go to /admin/config, select a cost center
2. Scroll to "Custom Categories" SectionCard
3. Add a category with name "Conference Fees" and code "CONF_FEES" — verify it appears in the list
4. Toggle its enabled checkbox — verify state updates
5. Click Save — verify toast "Custom categories saved" appears
6. Switch to a different CC — verify the list resets to that CC's custom categories
7. Rename an existing entry inline — verify the name field is editable
</verification>

<success_criteria>
- Full vitest suite is green (no regressions)
- TypeScript compiles without errors
- Admin config page renders Custom Categories SectionCard without breaking other sections
- Admin can add a custom category with valid name/code through the UI
- Admin can toggle enabled/disabled for each custom entry
- Admin can rename a custom entry inline
- Admin can remove a custom entry before saving
- Add form validates: empty name, invalid code characters, duplicate codes
- CC switch resets custom categories to the new CC's config (else branch in loadData)
- No maxAmount UI field (CATG-05 deferred to v2)
</success_criteria>

<output>
After completion, create `.planning/phases/04-custom-expense-categories/04-02-SUMMARY.md` following the summary template at @/Users/yokosimon/.claude/get-shit-done/templates/summary.md
</output>
