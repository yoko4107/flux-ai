import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST /api/leave/admin/adjustment — admin grants or claws back leave for
// one employee, one leave type, one calendar year. Positive days add to
// the allowance; negative days clawback. Stored as a permanent record so
// the audit trail is preserved.

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

const Body = z.object({
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  year: z.number().int().min(2000).max(2100).optional(),
  days: z.number().min(-100).max(100).refine((n) => n !== 0, "Days cannot be zero"),
  reason: z.string().min(5).max(2000),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!session.user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  const { employeeId, leaveTypeId, days, reason } = parsed.data
  const year = parsed.data.year ?? new Date().getUTCFullYear()

  // Both records must live in the admin's org.
  const [employee, leaveType] = await Promise.all([
    prisma.user.findUnique({ where: { id: employeeId }, select: { organizationId: true } }),
    prisma.leaveType.findUnique({ where: { id: leaveTypeId }, select: { organizationId: true } }),
  ])
  if (!employee || employee.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Employee not in your organization" }, { status: 403 })
  }
  if (!leaveType || leaveType.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Leave type not in your organization" }, { status: 403 })
  }

  const adj = await prisma.leaveBalanceAdjustment.create({
    data: {
      organizationId: session.user.organizationId,
      employeeId,
      leaveTypeId,
      year,
      days,
      reason,
      grantedById: session.user.id,
    },
  })
  return NextResponse.json({ adjustment: adj }, { status: 201 })
}

// GET /api/leave/admin/adjustment?employeeId=...&year=YYYY — history for an employee.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!session.user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })

  const url = new URL(req.url)
  const employeeId = url.searchParams.get("employeeId")
  const yearParam = url.searchParams.get("year")
  const year = yearParam ? Number(yearParam) : undefined

  const where: Record<string, unknown> = { organizationId: session.user.organizationId }
  if (employeeId) where.employeeId = employeeId
  if (year) where.year = year

  const items = await prisma.leaveBalanceAdjustment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      employee: { select: { id: true, name: true, email: true } },
      leaveType: { select: { id: true, code: true, name: true, colorHex: true } },
      grantedBy: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json({ adjustments: items })
}
