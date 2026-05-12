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

  const country = new URL(req.url).searchParams.get("country")?.toUpperCase()
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { countryCode: true } })
  const effectiveCountry = country ?? org?.countryCode ?? "ID"

  const rules = await prisma.countryPayrollRule.findMany({
    where: { organizationId: orgId, countryCode: effectiveCountry },
    include: {
      component: true,
      brackets: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { sortOrder: "asc" },
  })
  return NextResponse.json({ rules, country: effectiveCountry })
}

const BracketBody = z.object({
  minAmount: z.number().min(0),
  maxAmount: z.number().min(0).nullable().optional(),
  rate: z.number().min(0).max(1),
})

const Body = z.object({
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  componentId: z.string().min(1),
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

  const { countryCode, componentId, enabled, calculationType, fixedAmount, percentage, formula, minAmount, maxAmount, sortOrder, brackets } = parsed.data

  // Verify the component exists (FK would catch this, but a 400 is nicer
  // than a 500).
  const component = await prisma.payrollComponent.findUnique({ where: { id: componentId } })
  if (!component) return NextResponse.json({ error: "Unknown payroll component" }, { status: 400 })

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

  // Upsert the rule. Brackets are wiped + recreated to avoid stale ranges.
  const rule = await prisma.countryPayrollRule.upsert({
    where: { organizationId_countryCode_componentId: { organizationId: orgId, countryCode, componentId } },
    update: {
      enabled,
      calculationType,
      fixedAmount: fixedAmount ?? null,
      percentage: percentage ?? null,
      formula: formula ?? null,
      minAmount: minAmount ?? null,
      maxAmount: maxAmount ?? null,
      sortOrder: sortOrder ?? defaultSort,
      updatedById: session.user.id,
    },
    create: {
      organizationId: orgId,
      countryCode,
      componentId,
      enabled,
      calculationType,
      fixedAmount: fixedAmount ?? null,
      percentage: percentage ?? null,
      formula: formula ?? null,
      minAmount: minAmount ?? null,
      maxAmount: maxAmount ?? null,
      sortOrder: sortOrder ?? defaultSort,
      updatedById: session.user.id,
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
