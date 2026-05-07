import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { countWorkingDays, utcDateOnly } from "@/lib/leave-utils"
import {
  sendLeaveEmail,
  generateLeaveActionTokens,
} from "@/lib/leave-email"

// POST /api/leave/request — employee submits a new leave request.
// Resolves the supervisor from User.managerId. Validates dates, computes
// working-day total against the org's holiday calendar, generates the
// approve/reject email tokens, and emails the supervisor.

const Body = z.object({
  leaveTypeId: z.string().min(1),
  startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  isHalfDay: z.boolean().optional().default(false),
  halfDayPeriod: z.enum(["AM", "PM"]).optional(),
  reason: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const { leaveTypeId, startDate, endDate, isHalfDay, halfDayPeriod, reason } = parsed.data

  const employee = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { organization: { select: { id: true, name: true, countryCode: true } } },
  })
  if (!employee || !employee.organizationId) {
    return NextResponse.json({ error: "User has no organization" }, { status: 400 })
  }
  if (!employee.managerId) {
    return NextResponse.json(
      { error: "No supervisor assigned. Ask an admin to set your manager before submitting leave." },
      { status: 400 }
    )
  }

  const start = utcDateOnly(startDate)
  const end = utcDateOnly(endDate)
  if (end < start) {
    return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 })
  }
  if (isHalfDay && (!halfDayPeriod || start.getTime() !== end.getTime())) {
    return NextResponse.json({ error: "Half-day requests must use a single date and AM/PM" }, { status: 400 })
  }

  const leaveType = await prisma.leaveType.findFirst({
    where: { id: leaveTypeId, organizationId: employee.organizationId },
  })
  if (!leaveType) return NextResponse.json({ error: "Leave type not found" }, { status: 404 })

  // Holidays in range
  const holidays = await prisma.publicHoliday.findMany({
    where: {
      organizationId: employee.organizationId,
      date: { gte: start, lte: end },
    },
  })
  const totalDays = countWorkingDays(start, end, holidays, isHalfDay)
  if (totalDays <= 0) {
    return NextResponse.json({ error: "Selected range contains no working days" }, { status: 400 })
  }

  // Create with placeholder tokens, then overwrite with signed tokens that
  // embed the request id (not known until after insert).
  const created = await prisma.leaveRequest.create({
    data: {
      organizationId: employee.organizationId,
      employeeId: employee.id,
      supervisorId: employee.managerId,
      leaveTypeId: leaveType.id,
      startDate: start,
      endDate: end,
      totalDays,
      isHalfDay,
      halfDayPeriod: isHalfDay ? halfDayPeriod : null,
      reason: reason ?? null,
      status: "PENDING",
    },
  })

  const tokens = generateLeaveActionTokens(created.id, employee.managerId)
  const updated = await prisma.leaveRequest.update({
    where: { id: created.id },
    data: {
      approveToken: tokens.approveToken,
      rejectToken: tokens.rejectToken,
      tokenExpiresAt: tokens.tokenExpiresAt,
    },
  })

  const supervisor = await prisma.user.findUnique({ where: { id: employee.managerId } })
  if (supervisor?.email) {
    await sendLeaveEmail({
      type: "REQUEST_SUBMITTED",
      leaveRequestId: updated.id,
      to: { userId: supervisor.id, email: supervisor.email, name: supervisor.name ?? undefined },
      replyTo: employee.email ?? undefined,
      organizationName: employee.organization?.name,
      employeeName: employee.name ?? employee.email ?? "Employee",
      leaveTypeName: leaveType.name,
      startDate: start,
      endDate: end,
      totalDays,
      reason: reason ?? null,
      approveToken: tokens.approveToken,
      rejectToken: tokens.rejectToken,
    })
  }

  return NextResponse.json(updated, { status: 201 })
}

// GET /api/leave/request — list leave requests visible to the caller.
//   Employee: their own
//   Approver/Manager: requests where they are the supervisor
//   Admin: every request in their organization
//   SuperAdmin: every request in every org
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role
  const orgId = session.user.organizationId
  const url = new URL(req.url)
  const scope = url.searchParams.get("scope") // "mine" | "to-approve" | "all"
  const status = url.searchParams.get("status")
  const from = url.searchParams.get("from") // YYYY-MM-DD inclusive
  const to = url.searchParams.get("to")     // YYYY-MM-DD inclusive

  let where: Record<string, unknown> = {}

  if (role === "SUPER_ADMIN") {
    // no scope restriction
  } else if (role === "ADMIN" && orgId) {
    where.organizationId = orgId
  } else if (role === "APPROVER" || scope === "to-approve") {
    where.supervisorId = session.user.id
  } else {
    where.employeeId = session.user.id
  }

  if (scope === "mine") where = { ...where, employeeId: session.user.id }
  if (status) where.status = status

  // Range filter — match leaves that *overlap* [from, to] (both inclusive):
  //   leave.startDate <= to  AND  leave.endDate >= from
  if (to) (where as Record<string, unknown>).startDate = { lte: new Date(`${to}T23:59:59Z`) }
  if (from) (where as Record<string, unknown>).endDate = { gte: new Date(`${from}T00:00:00Z`) }

  const requests = await prisma.leaveRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      leaveType: { select: { id: true, code: true, name: true, colorHex: true } },
      employee: { select: { id: true, name: true, email: true } },
      supervisor: { select: { id: true, name: true, email: true } },
      proposals: { orderBy: { createdAt: "asc" } },
    },
  })

  return NextResponse.json({ requests })
}

// Note: team calendar view consumes the same GET endpoint with
// ?scope=to-approve&status=APPROVED&from=...&to=... — see /approver/leave.
