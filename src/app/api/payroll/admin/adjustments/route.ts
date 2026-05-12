import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST /api/payroll/admin/adjustments
//   Body: { employeeId, period (YYYY-MM), componentCode, amount, description? }
// GET  /api/payroll/admin/adjustments?employeeId=...&period=YYYY-MM
//
// Positive amount = adds to earnings; negative = deduction. Admin-only.

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

const Body = z.object({
  employeeId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  componentCode: z.string().min(1).max(60),
  amount: z.number().min(-100_000_000).max(100_000_000),
  description: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })

  const employee = await prisma.user.findUnique({
    where: { id: parsed.data.employeeId },
    select: { id: true, organizationId: true },
  })
  if (!employee || !employee.organizationId) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 })
  }
  if (session.user.role === "ADMIN" && employee.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const adjustment = await prisma.payrollAdjustment.create({
    data: {
      organizationId: employee.organizationId,
      employeeId: employee.id,
      period: parsed.data.period,
      componentCode: parsed.data.componentCode.toUpperCase(),
      amount: parsed.data.amount,
      description: parsed.data.description ?? null,
      createdById: session.user.id,
    },
  })
  return NextResponse.json({ adjustment }, { status: 201 })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const url = new URL(req.url)
  const employeeId = url.searchParams.get("employeeId") ?? undefined
  const period = url.searchParams.get("period") ?? undefined

  const where: Record<string, unknown> = {}
  if (session.user.role === "ADMIN" && session.user.organizationId) {
    where.organizationId = session.user.organizationId
  }
  if (employeeId) where.employeeId = employeeId
  if (period) where.period = period

  const adjustments = await prisma.payrollAdjustment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { employee: { select: { id: true, name: true, email: true } } },
  })
  return NextResponse.json({ adjustments })
}
