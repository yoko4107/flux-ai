---
phase: 01-cost-center-config-scoping
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/config-scoping.ts
  - src/lib/__tests__/config-scoping.test.ts
  - src/app/api/admin/config/route.ts
autonomous: true
requirements:
  - NAV-01
  - NAV-02

must_haves:
  truths:
    - "GET /api/admin/config?costCenterId=X returns CC-specific rows merged over org-wide rows"
    - "GET without costCenterId continues to return org-wide rows (no regression)"
    - "PUT /api/admin/config with costCenterId writes a CC-specific row, not the org-wide row"
    - "PUT with a costCenterId that belongs to a different org returns 403"
    - "Keys present only in org-wide config are returned as fallback values for CC-scoped GET"
  artifacts:
    - path: "src/lib/config-scoping.ts"
      provides: "Pure mergeConfigs() and validateCCOwnership() functions"
      exports: ["mergeConfigs", "validateCCOwnership"]
    - path: "src/lib/__tests__/config-scoping.test.ts"
      provides: "Unit tests for merge fallback and ownership validation"
      contains: "mergeConfigs"
    - path: "src/app/api/admin/config/route.ts"
      provides: "Extended GET with ?costCenterId param and fallback merge; extended PUT with costCenterId in body and CC ownership check"
  key_links:
    - from: "src/app/api/admin/config/route.ts GET"
      to: "src/lib/config-scoping.ts mergeConfigs"
      via: "import and call after fetching CC + org rows from Prisma"
      pattern: "mergeConfigs\\(ccConfigs, orgConfigs\\)"
    - from: "src/app/api/admin/config/route.ts PUT"
      to: "prisma.costCenter.findFirst"
      via: "CC ownership check before upsert"
      pattern: "costCenter\\.findFirst.*costCenterId.*organizationId"
    - from: "src/app/api/admin/config/route.ts PUT"
      to: "prisma.adminConfig.upsert"
      via: "dynamic costCenterId (was hardcoded null)"
      pattern: "costCenterId:.*null as unknown as string"
---

<objective>
Extend the `/api/admin/config` route handler to accept `costCenterId` in both GET and PUT, implement server-side fallback merge, and add cost center ownership validation.

Purpose: This is the data layer foundation. Without it, the UI (Plan 02) has nothing to scope to — every read and write still targets org-wide rows regardless of which CC the admin selects.

Output: A tested `config-scoping.ts` lib module with pure merge/validation functions, and an updated `route.ts` that threads `costCenterId` end-to-end.
</objective>

<execution_context>
@/Users/yokosimon/.claude/get-shit-done/workflows/execute-plan.md
@/Users/yokosimon/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-cost-center-config-scoping/01-RESEARCH.md

<!-- Key interfaces the executor needs — no codebase exploration required -->
<interfaces>
From prisma/schema.prisma (lines 375–394):
```prisma
model AdminConfig {
  id             String   @id @default(cuid())
  key            String
  value          Json
  organizationId String?
  costCenterId   String?
  updatedAt      DateTime @updatedAt
  updatedById    String?

  updatedBy    User?         @relation(...)
  organization Organization? @relation(...)
  costCenter   CostCenter?   @relation("AdminConfigCostCenter", ...)

  @@unique([key, organizationId, costCenterId], map: "AdminConfig_key_org_cc_key")
  @@index([key, organizationId])
}
```
Prisma compound key name (used in `where` clauses): `key_organizationId_costCenterId`

From src/app/api/admin/config/route.ts (current GET, line 64):
```typescript
const configs = await prisma.adminConfig.findMany({
  where: { organizationId: scope.orgId },  // currently ignores costCenterId entirely
  include: { updatedBy: { select: { id: true, name: true } } },
})
```

From src/app/api/admin/config/route.ts (current PUT upsert, lines 119–132):
```typescript
await prisma.adminConfig.upsert({
  where: { key_organizationId_costCenterId: {
    key,
    organizationId: scope.orgId ?? null as unknown as string,
    costCenterId: null as unknown as string,  // HARDCODED — must become dynamic
  }},
  create: { key, organizationId: scope.orgId, value: valueResult.data, updatedById: session.user.id },
  update: { value: valueResult.data, updatedById: session.user.id },
  include: { updatedBy: { select: { id: true, name: true } } },
})
```

From src/app/api/admin/config/route.ts (current PUT body schema, line 92):
```typescript
const parsed = z.object({
  key: z.string(),
  value: z.unknown(),
  organizationId: z.string().nullable().optional(),
  // costCenterId is MISSING — must be added
}).safeParse(body)
```

CRITICAL null cast pattern (must be preserved, now with dynamic value):
`costCenterId: (costCenterId ?? null) as unknown as string`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract config-scoping lib with unit tests (Wave 0)</name>
  <files>src/lib/config-scoping.ts, src/lib/__tests__/config-scoping.test.ts</files>
  <behavior>
    - mergeConfigs(ccRows, orgRows): ccRow wins over orgRow for same key; orgRow returned if no ccRow for that key; extra ccRows included; empty ccRows returns all orgRows; empty orgRows returns all ccRows
    - validateCCOwnership(prisma, costCenterId, orgId): returns the CostCenter if found; returns null if costCenterId belongs to different org; returns null if costCenterId does not exist; passes through when costCenterId is null (org-wide — always valid)
  </behavior>
  <action>
    Create `src/lib/config-scoping.ts` with two exported pure/async functions:

    ```typescript
    import type { PrismaClient } from "@/generated/prisma"

    type AdminConfigRow = {
      key: string
      value: unknown
      [key: string]: unknown
    }

    /**
     * Merge CC-specific rows over org-wide rows.
     * CC row wins for the same key; org-wide row is the fallback.
     */
    export function mergeConfigs<T extends AdminConfigRow>(
      ccRows: T[],
      orgRows: T[]
    ): T[] {
      const merged = new Map<string, T>()
      for (const row of orgRows) merged.set(row.key, row)
      for (const row of ccRows) merged.set(row.key, row)  // overwrites org-wide
      return Array.from(merged.values())
    }

    /**
     * Verify costCenterId belongs to orgId.
     * Returns the CostCenter if valid, null if ownership fails.
     * Always returns a truthy-ish sentinel for null costCenterId (org-wide is always valid).
     */
    export async function validateCCOwnership(
      prisma: PrismaClient,
      costCenterId: string | null,
      orgId: string | null
    ): Promise<{ id: string } | null> {
      if (!costCenterId) return { id: "" }  // null = org-wide, always allowed
      return prisma.costCenter.findFirst({
        where: { id: costCenterId, organizationId: orgId ?? undefined },
        select: { id: true },
      })
    }
    ```

    Create `src/lib/__tests__/config-scoping.test.ts` with Vitest tests covering all behavior cases listed above. Use `vi.fn()` or a minimal Prisma mock for validateCCOwnership tests — do not require a real DB connection.

    Run tests RED first (write tests before implementation), then GREEN. Commit after GREEN.
  </action>
  <verify>
    <automated>npx vitest run src/lib/__tests__/config-scoping.test.ts</automated>
  </verify>
  <done>All mergeConfigs and validateCCOwnership test cases pass. Files exist with exported functions.</done>
</task>

<task type="auto">
  <name>Task 2: Extend route.ts GET and PUT to thread costCenterId</name>
  <files>src/app/api/admin/config/route.ts</files>
  <action>
    Modify `src/app/api/admin/config/route.ts` with the following targeted changes. Do NOT restructure unrelated logic.

    **GET handler changes:**

    After the existing `resolveScope` call, read the optional costCenterId query param:
    ```typescript
    const costCenterId = searchParams.get("costCenterId") || null
    ```

    Replace the single `prisma.adminConfig.findMany` call with a two-step fetch + merge:
    ```typescript
    // 1. CC-specific rows (empty array if no costCenterId)
    const ccConfigs = costCenterId
      ? await prisma.adminConfig.findMany({
          where: { organizationId: scope.orgId, costCenterId },
          include: { updatedBy: { select: { id: true, name: true } } },
        })
      : []

    // 2. Org-wide rows (always fetched as fallback)
    const orgConfigs = await prisma.adminConfig.findMany({
      where: { organizationId: scope.orgId, costCenterId: null },
      include: { updatedBy: { select: { id: true, name: true } } },
    })

    // 3. Merge: CC-specific takes precedence
    import { mergeConfigs } from "@/lib/config-scoping"
    const configs = mergeConfigs(ccConfigs, orgConfigs)
    ```

    Add `costCenterId` to the response scope:
    ```typescript
    return NextResponse.json({ configs: result, meta, scope: { organizationId: scope.orgId, costCenterId } })
    ```

    **PUT handler changes:**

    Add `costCenterId` to the Zod body schema:
    ```typescript
    const parsed = z.object({
      key: z.string(),
      value: z.unknown(),
      organizationId: z.string().nullable().optional(),
      costCenterId: z.string().nullable().optional(),  // NEW
    }).safeParse(body)
    ```

    Destructure `costCenterId` from parsed data:
    ```typescript
    const { key, value, organizationId, costCenterId } = parsed.data
    ```

    After `resolveScope`, add CC ownership validation:
    ```typescript
    import { validateCCOwnership } from "@/lib/config-scoping"
    const ccId = costCenterId ?? null
    if (ccId) {
      const owned = await validateCCOwnership(prisma, ccId, scope.orgId)
      if (!owned) {
        return NextResponse.json({ error: "Cost center not found or access denied" }, { status: 403 })
      }
    }
    ```

    Update BOTH the `findUnique` and `upsert` where clauses to use dynamic `ccId` instead of hardcoded `null`:
    ```typescript
    // findUnique (existing audit read):
    where: { key_organizationId_costCenterId: {
      key,
      organizationId: scope.orgId ?? null as unknown as string,
      costCenterId: (ccId ?? null) as unknown as string,  // was: null as unknown as string
    }}

    // upsert:
    where: { key_organizationId_costCenterId: {
      key,
      organizationId: scope.orgId ?? null as unknown as string,
      costCenterId: (ccId ?? null) as unknown as string,  // was: null as unknown as string
    }}
    create: {
      key,
      organizationId: scope.orgId,
      costCenterId: ccId,          // NEW field in create
      value: valueResult.data as Parameters<typeof prisma.adminConfig.create>[0]["data"]["value"],
      updatedById: session.user.id,
    }
    ```

    Preserve the EXACT `null as unknown as string` cast pattern — only the value changes from literal `null` to `(ccId ?? null)`.

    TypeScript must compile with no errors. Run `npx tsc --noEmit` to confirm.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run src/lib/__tests__/config-scoping.test.ts</automated>
  </verify>
  <done>
    - GET /api/admin/config?costCenterId=X fetches CC rows, merges over org-wide rows
    - GET /api/admin/config (no param) returns only org-wide rows (no regression)
    - PUT body accepts costCenterId; upserts to CC-specific row when provided
    - PUT with unknown costCenterId returns 403
    - TypeScript compiles clean
  </done>
</task>

</tasks>

<verification>
Full test suite green: `npx vitest run`
TypeScript compiles: `npx tsc --noEmit`
Manual smoke test (curl or browser DevTools):
  - GET /api/admin/config returns 200 with existing org-wide data (no regression)
  - GET /api/admin/config?costCenterId={valid-id} returns 200 with merged config
  - PUT with { key: "submissionDeadline", value: 20, costCenterId: "{valid-id}" } returns 200
  - PUT with { key: "submissionDeadline", value: 20, costCenterId: "fake-id" } returns 403
</verification>

<success_criteria>
1. `mergeConfigs` unit tests: CC row wins for duplicate keys; org-wide row returned as fallback
2. `validateCCOwnership` unit tests: returns null for foreign CC, truthy for own CC, truthy for null (org-wide)
3. GET handler: fetches CC rows + org rows, merges them, returns merged result
4. PUT handler: validates CC ownership before write; writes to CC-specific row when costCenterId provided; writes to org-wide row when costCenterId is null
5. Null cast pattern preserved: `(ccId ?? null) as unknown as string` in Prisma upsert where clause
6. All existing tests still pass (no regression)
</success_criteria>

<output>
After completion, create `.planning/phases/01-cost-center-config-scoping/01-api-extension-SUMMARY.md`
</output>
