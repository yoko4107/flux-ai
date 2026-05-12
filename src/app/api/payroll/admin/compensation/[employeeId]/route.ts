import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma"

// GET /api/payroll/admin/compensation/[employeeId]    — view comp profile
// PUT /api/payroll/admin/compensation/[employeeId]    — upsert profile
//
// Admin-only. The employee record must belong to the caller's org
// (super-admins skip that check).

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

async function loadEmployee(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { compensation: true },
  })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { employeeId } = await params
  const employee = await loadEmployee(employeeId)
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (session.user.role === "ADMIN" && employee.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return NextResponse.json({ compensation: employee.compensation })
}

const Body = z.object({
  baseSalary: z.number().min(0).max(1_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  workingDaysPerMonth: z.number().int().min(1).max(31).optional().default(22),
  startedAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endedAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
  // Free-form { COMPONENT_CODE: amount } in MAJOR units. Allows admins to set
  // a higher housing allowance for a specific employee than the country rule.
  componentOverrides: z.record(z.string(), z.number().min(0).max(1_000_000_000)).optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { employeeId } = await params
  const employee = await loadEmployee(employeeId)
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!employee.organizationId) return NextResponse.json({ error: "Employee has no org" }, { status: 400 })
  if (session.user.role === "ADMIN" && employee.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })

  const compensation = await prisma.employeeCompensation.upsert({
    where: { employeeId },
    update: {
      baseSalary: parsed.data.baseSalary,
      currency: parsed.data.currency,
      workingDaysPerMonth: parsed.data.workingDaysPerMonth,
      startedAt: new Date(parsed.data.startedAt),
      endedAt: parsed.data.endedAt ? new Date(parsed.data.endedAt) : null,
      // Prisma's nullable JSON requires the magic sentinel rather than
      // literal `null` (which sets undefined behaviour). Pass undefined
      // to leave the column unchanged when no overrides supplied.
      componentOverrides: parsed.data.componentOverrides ?? Prisma.JsonNull,
    },
    create: {
      organizationId: employee.organizationId,
      employeeId,
      baseSalary: parsed.data.baseSalary,
      currency: parsed.data.currency,
      workingDaysPerMonth: parsed.data.workingDaysPerMonth,
      startedAt: new Date(parsed.data.startedAt),
      endedAt: parsed.data.endedAt ? new Date(parsed.data.endedAt) : null,
      componentOverrides: parsed.data.componentOverrides ?? Prisma.JsonNull,
    },
  })
  return NextResponse.json({ compensation })
}
