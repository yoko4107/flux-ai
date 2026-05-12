import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET  /api/payroll/admin/rules?country=ID   — list rules for caller's org
// POST /api/payroll/admin/rules               — upsert a rule (with brackets)
//
// Country code defaults to the org's countryCode when ?country is omitted.
// Admin-only. Super-admins can pass ?orgId to scope to another org.

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

// Inline-typed helper — `Awaited<ReturnType<typeof auth>>` trips a TS
// overload conflict with next-auth's NextMiddleware overload, so we accept
// just the user object the caller already destructured.
function resolveOrgId(
  req: NextRequest,
  user: { role: string; organizationId: string | null }
): string | null {
  const url = new URL(req.url)
  const param = url.searchParams.get("orgId")
  if (user.role === "SUPER_ADMIN" && param) return param
  return user.organizationId ?? null
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const orgId = resolveOrgId(req, {
    role: session.user.role,
    organizationId: session.user.organizationId ?? null,
  })
  if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 })

  const url = new URL(req.url)
  const country = url.searchParams.get("country")?.toUpperCase()
  // costCenterId param semantics:
  //   absent      → all rules for the org (per-CC + org-wide mixed)
  //   "" / "ORG"  → org-wide fallback rules only (costCenterId IS NULL)
  //   "<id>"      → rules for that specific cost center
  const ccParam = url.searchParams.get("costCenterId")
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { countryCode: true } })
  const effectiveCountry = country ?? org?.countryCode ?? "ID"

  const ccFilter =
    ccParam === null ? {}
    : ccParam === "" || ccParam === "ORG" ? { costCenterId: null }
    : { costCenterId: ccParam }

  const rules = await prisma.countryPayrollRule.findMany({
    where: { organizationId: orgId, countryCode: effectiveCountry, ...ccFilter },
    include: {
      component: true,
      costCenter: { select: { id: true, code: true, name: true, currency: true } },
      brackets: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: [{ costCenterId: "asc" }, { sortOrder: "asc" }],
  })

  // Also surface the org's cost centers so the UI can offer the picker
  // without a second round-trip.
  const costCenters = await prisma.costCenter.findMany({
    where: { organizationId: orgId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, countryCode: true, currency: true },
  })

  return NextResponse.json({ rules, country: effectiveCountry, costCenters, scope: ccParam ?? null })
}

const BracketBody = z.object({
  minAmount: z.number().min(0),
  maxAmount: z.number().min(0).nullable().optional(),
  rate: z.number().min(0).max(1),
})

const Body = z.object({
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  componentId: z.string().min(1),
  // null = org-wide fallback rule. Omit / undefined is treated the same.
  costCenterId: z.string().nullable().optional(),
  enabled: z.boolean().optional().default(true),
  calculationType: z.enum(["FIXED", "PERCENT_BASE", "PERCENT_GROSS", "BRACKET", "FORMULA"]),
  fixedAmount: z.number().min(0).max(100_000_000).nullable().optional(),
  percentage: z.number().min(0).max(1).nullable().optional(),
  formula: z.string().max(500).nullable().optional(),
  minAmount: z.number().min(0).nullable().optional(),
  maxAmount: z.number().min(0).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  brackets: z.array(BracketBody).max(20).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const orgId = resolveOrgId(req, {
    role: session.user.role,
    organizationId: session.user.organizationId ?? null,
  })
  if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })

  const { countryCode, componentId, costCenterId, enabled, calculationType, fixedAmount, percentage, formula, minAmount, maxAmount, sortOrder, brackets } = parsed.data

  // Verify the component exists (FK would catch this, but a 400 is nicer
  // than a 500).
  const component = await prisma.payrollComponent.findUnique({ where: { id: componentId } })
  if (!component) return NextResponse.json({ error: "Unknown payroll component" }, { status: 400 })

  // If a cost center is supplied, make sure it belongs to this org.
  if (costCenterId) {
    const cc = await prisma.costCenter.findUnique({ where: { id: costCenterId }, select: { organizationId: true } })
    if (!cc || cc.organizationId !== orgId) {
      return NextResponse.json({ error: "Cost center not found in this organization" }, { status: 400 })
    }
  }

  // BRACKET rules need at least one bracket; other types ignore them.
  if (calculationType === "BRACKET" && (!brackets || brackets.length === 0)) {
    return NextResponse.json({ error: "BRACKET rules require at least one bracket" }, { status: 400 })
  }

  // Default sortOrder ranges so earnings render before deductions in the UI
  // without admins having to think about it.
  const defaultSort =
    component.type === "EARNING" ? 50
    : component.type === "STATUTORY_DEDUCTION" ? 150
    : component.type === "VOLUNTARY_DEDUCTION" ? 250
    : 350 // EMPLOYER_CONTRIBUTION

  // The unique is (orgId, costCenterId, componentId) with NULLS NOT DISTINCT,
  // but Prisma's upsert helper can't express NULL in a composite-unique
  // lookup. Find-then-update-or-create manually.
  const existing = await prisma.countryPayrollRule.findFirst({
    where: { organizationId: orgId, componentId, costCenterId: costCenterId ?? null },
  })

  const ruleData = {
    enabled,
    calculationType,
    fixedAmount: fixedAmount ?? null,
    percentage: percentage ?? null,
    formula: formula ?? null,
    minAmount: minAmount ?? null,
    maxAmount: maxAmount ?? null,
    sortOrder: sortOrder ?? defaultSort,
    updatedById: session.user.id,
  }

  const rule = existing
    ? await prisma.countryPayrollRule.update({ where: { id: existing.id }, data: ruleData })
    : await prisma.countryPayrollRule.create({
        data: {
          organizationId: orgId,
          countryCode,
          componentId,
          costCenterId: costCenterId ?? null,
          ...ruleData,
        },
      })

  if (calculationType === "BRACKET") {
    await prisma.payrollBracket.deleteMany({ where: { ruleId: rule.id } })
    await prisma.payrollBracket.createMany({
      data: (brackets ?? []).map((b, i) => ({
        ruleId: rule.id,
        minAmount: b.minAmount,
        maxAmount: b.maxAmount ?? null,
        rate: b.rate,
        sortOrder: i,
      })),
    })
  }

  const fresh = await prisma.countryPayrollRule.findUnique({
    where: { id: rule.id },
    include: { component: true, brackets: { orderBy: { sortOrder: "asc" } } },
  })
  return NextResponse.json({ rule: fresh })
}
