import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendLeaveEmail } from "@/lib/leave-email"
import { CalendarService } from "@/lib/calendar/calendar-service"
import { halfDayWindow } from "@/lib/calendar/ics"

// PATCH /api/leave/request/[id] — supervisor approves / rejects, employee cancels.
//
// Body shape:
//   { action: "APPROVE", supervisorNote?: string }
//   { action: "REJECT",  rejectionReason: string (≥20 chars) }
//   { action: "CANCEL" }                                  (employee only, status=PENDING|NEGOTIATING)

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("APPROVE"), supervisorNote: z.string().max(2000).optional() }),
  z.object({ action: z.literal("REJECT"), rejectionReason: z.string().min(20, "Rejection reason must be at least 20 characters").max(2000) }),
  z.object({ action: z.literal("CANCEL") }),
])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const action = parsed.data

  const lr = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      leaveType: { select: { name: true } },
      employee: { select: { id: true, name: true, email: true } },
      supervisor: { select: { id: true, name: true, email: true } },
      organization: { select: { id: true, name: true } },
    },
  })
  if (!lr) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Authorization
  const isOwner = lr.employeeId === session.user.id
  const isSupervisor = lr.supervisorId === session.user.id
  const isOrgAdmin = session.user.role === "ADMIN" && lr.organizationId === session.user.organizationId
  const isSuperAdmin = session.user.role === "SUPER_ADMIN"

  if (action.action === "CANCEL") {
    if (!isOwner) return NextResponse.json({ error: "Only the requester can cancel" }, { status: 403 })
    if (!["PENDING", "NEGOTIATING"].includes(lr.status)) {
      return NextResponse.json({ error: `Cannot cancel a ${lr.status} request` }, { status: 400 })
    }
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: { status: "CANCELLED" },
    })
    // If a calendar event was already pushed (rare on PENDING but possible
    // after a NEGOTIATING resolve), best-effort delete it.
    if (lr.calEventEmployeeId) {
      await CalendarService.deleteEventBestEffort(lr.employeeId, lr.calEventEmployeeId)
    }
    return NextResponse.json(updated)
  }

  if (!isSupervisor && !isOrgAdmin && !isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!["PENDING", "NEGOTIATING"].includes(lr.status)) {
    return NextResponse.json({ error: `Cannot ${action.action.toLowerCase()} a ${lr.status} request` }, { status: 400 })
  }

  if (action.action === "APPROVE") {
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        supervisorNote: action.supervisorNote ?? null,
      },
    })

    // Mark any pending proposals on this thread as superseded.
    await prisma.leaveProposal.updateMany({
      where: { leaveRequestId: id, status: "PENDING" },
      data: { status: "SUPERSEDED" },
    })

    // Best-effort: push the event into the employee's connected calendar
    // (Google for now). Failures don't block approval — the .ics is still
    // attached to the email.
    const employeeEventId = await pushApprovedEventToCalendar(lr)
    if (employeeEventId) {
      await prisma.leaveRequest.update({
        where: { id },
        data: { calEventEmployeeId: employeeEventId },
      })
    }

    if (lr.employee.email) {
      await sendLeaveEmail({
        type: "APPROVED",
        leaveRequestId: id,
        to: { userId: lr.employee.id, email: lr.employee.email, name: lr.employee.name ?? undefined },
        replyTo: lr.supervisor.email ?? undefined,
        organizationName: lr.organization?.name,
        employeeName: lr.employee.name ?? "Employee",
        leaveTypeName: lr.leaveType.name,
        startDate: lr.startDate,
        endDate: lr.endDate,
        totalDays: lr.totalDays,
        isHalfDay: lr.isHalfDay,
        halfDayPeriod: lr.halfDayPeriod as "AM" | "PM" | null,
        supervisorNote: action.supervisorNote ?? null,
      })
    }
    return NextResponse.json(updated)
  }

  if (action.action === "REJECT") {
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectionReason: action.rejectionReason,
      },
    })

    await prisma.leaveProposal.updateMany({
      where: { leaveRequestId: id, status: "PENDING" },
      data: { status: "SUPERSEDED" },
    })

    if (lr.employee.email && lr.supervisor.email) {
      await sendLeaveEmail({
        type: "REJECTED",
        leaveRequestId: id,
        to: { userId: lr.employee.id, email: lr.employee.email, name: lr.employee.name ?? undefined },
        replyTo: lr.supervisor.email,
        organizationName: lr.organization?.name,
        employeeName: lr.employee.name ?? "Employee",
        supervisorName: lr.supervisor.name ?? "Supervisor",
        supervisorEmail: lr.supervisor.email,
        leaveTypeName: lr.leaveType.name,
        startDate: lr.startDate,
        endDate: lr.endDate,
        rejectionReason: action.rejectionReason,
      })
    }
    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: "Unhandled action" }, { status: 400 })
}

// Push an APPROVED leave into the employee's connected calendar via the
// abstraction. Returns the provider event id, or null on any failure /
// when no provider is connected. Never throws.
async function pushApprovedEventToCalendar(lr: {
  id: string
  employeeId: string
  startDate: Date
  endDate: Date
  isHalfDay: boolean
  halfDayPeriod: string | null
  totalDays: number
  leaveType: { name: string }
  employee: { name: string | null; email: string | null }
}): Promise<string | null> {
  const isHalf = lr.isHalfDay && (lr.halfDayPeriod === "AM" || lr.halfDayPeriod === "PM")
  const start = isHalf
    ? halfDayWindow(lr.startDate, lr.halfDayPeriod as "AM" | "PM").start
    : lr.startDate
  const end = isHalf
    ? halfDayWindow(lr.startDate, lr.halfDayPeriod as "AM" | "PM").end
    : new Date(Date.UTC(
        lr.endDate.getUTCFullYear(),
        lr.endDate.getUTCMonth(),
        lr.endDate.getUTCDate() + 1
      ))
  return CalendarService.createEventBestEffort(lr.employeeId, {
    uid: `leave-${lr.id}@flux.ai`,
    title: `${lr.leaveType.name}${isHalf ? ` (${lr.halfDayPeriod})` : ""}`,
    description: `${lr.totalDays} day(s) of ${lr.leaveType.name}`,
    start,
    end,
    allDay: !isHalf,
  })
}
