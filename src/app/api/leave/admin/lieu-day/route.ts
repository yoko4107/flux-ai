import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { utcDateOnly } from "@/lib/leave-utils"

// POST /api/leave/admin/lieu-day
// Admin-only manual lieu-day grant. Useful when someone earned comp time
// outside the supervisor OT flow (e.g. a public-holiday on-call rota that
// lives in another system). Creates an OvertimeRecord with hoursWorked=0
// and a fixed lieu-days credit so the existing balance/expiry logic just
// works.

const Body = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lieuDays: z.number().min(0.25).max(30),
  reason: z.string().min(5).max(2000),
  expiresInMonths: z.number().int().min(1).max(36).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
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

  const expiresInMs = (parsed.data.expiresInMonths ?? 6) * 30 * 24 * 60 * 60 * 1000
  const record = await prisma.overtimeRecord.create({
    data: {
      organizationId: employee.organizationId,
      employeeId: employee.id,
      supervisorId: session.user.id, // admin acts as the granting supervisor
      date: utcDateOnly(parsed.data.date),
      hoursWorked: 0,
      dayType: "WEEKDAY",
      multiplier: 0,
      lieuDaysEarned: parsed.data.lieuDays,
      lieuExpiresAt: new Date(Date.now() + expiresInMs),
      notes: `[manual grant] ${parsed.data.reason}`,
      status: "APPROVED",
    },
  })
  return NextResponse.json({ record }, { status: 201 })
}
