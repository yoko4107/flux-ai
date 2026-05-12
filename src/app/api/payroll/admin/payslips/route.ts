import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generatePayslipDraft } from "@/lib/payroll-server"
import { fromMinor } from "@/lib/payroll"

// POST /api/payroll/admin/payslips
//   Body: { employeeId, period (YYYY-MM), workingDays?, paidDays?, notes? }
// GET  /api/payroll/admin/payslips?period=YYYY-MM&status=DRAFT|FINALIZED|PAID
//
// POST: re-runs the engine and persists. If a DRAFT exists for this
// employee+period it is overwritten; FINALIZED/PAID payslips are
// immutable and the request is refused.

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

const PostBody = z.object({
  employeeId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  workingDays: z.number().int().min(1).max(31).optional(),
  paidDays: z.number().int().min(0).max(31).optional(),
  notes: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const parsed = PostBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })

  const employee = await prisma.user.findUnique({
    where: { id: parsed.data.employeeId },
    select: { organizationId: true },
  })
  if (!employee?.organizationId) return NextResponse.json({ error: "Employee not found" }, { status: 404 })
  if (session.user.role === "ADMIN" && employee.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Refuse to overwrite a finalised/paid payslip.
  const existing = await prisma.payslip.findUnique({
    where: { employeeId_period: { employeeId: parsed.data.employeeId, period: parsed.data.period } },
  })
  if (existing && existing.status !== "DRAFT") {
    return NextResponse.json(
      { error: `Payslip for ${parsed.data.period} is ${existing.status} and immutable. Open it to view.` },
      { status: 409 }
    )
  }

  let result
  try {
    result = await generatePayslipDraft(parsed.data.employeeId, parsed.data.period, {
      workingDays: parsed.data.workingDays,
      paidDays: parsed.data.paidDays,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Generate failed" }, { status: 400 })
  }
  const { draft, countryCode, currency, organizationId, costCenterId } = result

  // Delete existing draft lines (cascade handles them on the payslip
  // delete) then re-create. Simpler than computing the diff.
  if (existing) await prisma.payslip.delete({ where: { id: existing.id } })

  const payslip = await prisma.payslip.create({
    data: {
      organizationId,
      costCenterId,
      employeeId: parsed.data.employeeId,
      period: parsed.data.period,
      countryCode,
      currency,
      workingDays: draft.workingDays,
      paidDays: draft.paidDays,
      grossPay: fromMinor(draft.grossPay),
      taxableIncome: fromMinor(draft.taxableIncome),
      totalDeductions: fromMinor(draft.totalDeductions),
      netPay: fromMinor(draft.netPay),
      employerCost: fromMinor(draft.employerCost),
      status: "DRAFT",
      notes: parsed.data.notes ?? null,
      lines: {
        createMany: {
          data: draft.lines.map((l) => ({
            componentCode: l.componentCode,
            componentName: l.componentName,
            type: l.type,
            amount: fromMinor(l.amount),
            description: l.description ?? null,
            sortOrder: l.sortOrder,
          })),
        },
      },
    },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  })
  return NextResponse.json({ payslip }, { status: 201 })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const url = new URL(req.url)
  const period = url.searchParams.get("period") ?? undefined
  const status = url.searchParams.get("status") ?? undefined
  const employeeId = url.searchParams.get("employeeId") ?? undefined

  const where: Record<string, unknown> = {}
  if (session.user.role === "ADMIN" && session.user.organizationId) {
    where.organizationId = session.user.organizationId
  }
  if (period) where.period = period
  if (status) where.status = status
  if (employeeId) where.employeeId = employeeId

  const payslips = await prisma.payslip.findMany({
    where,
    orderBy: [{ period: "desc" }, { generatedAt: "desc" }],
    include: {
      employee: { select: { id: true, name: true, email: true } },
      lines: { orderBy: { sortOrder: "asc" } },
    },
    take: 200,
  })
  return NextResponse.json({ payslips })
}
