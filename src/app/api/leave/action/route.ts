import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/email-tokens"

// GET  /api/leave/action?t=<token>            — peek: returns what the token does (used by /leave/action page to render the form)
// POST /api/leave/action  body: { token, payload? }  — execute the action.
//
// For APPROVE / AGREE the payload is optional.
// For REJECT / DISAGREE / propose-different-dates the payload carries the
// rejection reason or the new dates+message.
//
// On any successful execution we record `tokenUsedAt` and `actionTaken`
// on the matching LeaveEmailEvent, enforcing single-use semantics.

export async function GET(req: NextRequest) {
  const t = new URL(req.url).searchParams.get("t")
  if (!t) return NextResponse.json({ error: "Missing token" }, { status: 400 })
  const decoded = verifyToken(t)
  if (!decoded) return NextResponse.json({ error: "EXPIRED_OR_INVALID" }, { status: 410 })
  const used = await isTokenUsed(decoded)
  if (used) return NextResponse.json({ error: "ALREADY_USED" }, { status: 410 })
  return NextResponse.json({ ok: true, action: decoded.action, resourceId: decoded.resourceId, resourceType: decoded.resourceType })
}

const PostBody = z.object({
  token: z.string(),
  rejectionReason: z.string().min(20).max(2000).optional(),
  responseNote: z.string().max(2000).optional(),
  // counter-proposal payload (when employee disagrees inline)
  proposedStart: z.string().optional(),
  proposedEnd: z.string().optional(),
  message: z.string().min(20).max(2000).optional(),
})

export async function POST(req: NextRequest) {
  const parsed = PostBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const { token, rejectionReason, responseNote, proposedStart, proposedEnd, message } = parsed.data
  const decoded = verifyToken(token)
  if (!decoded) return NextResponse.json({ error: "EXPIRED_OR_INVALID" }, { status: 410 })

  const used = await isTokenUsed(decoded)
  if (used) return NextResponse.json({ error: "ALREADY_USED" }, { status: 410 })

  // Dispatch through the existing PATCH/POST routes by reaching directly
  // into Prisma — no fetch round-trip. This keeps everything within one
  // request and avoids re-validating auth (the token IS the auth here).
  switch (decoded.action) {
    case "APPROVE_LEAVE": {
      await applyApproveLeave(decoded.resourceId, responseNote)
      await markTokenUsed(decoded, "APPROVED")
      return NextResponse.json({ ok: true, redirect: "/employee/leave" })
    }
    case "REJECT_LEAVE": {
      if (!rejectionReason) return NextResponse.json({ error: "REJECTION_REASON_REQUIRED" }, { status: 400 })
      await applyRejectLeave(decoded.resourceId, rejectionReason)
      await markTokenUsed(decoded, "REJECTED")
      return NextResponse.json({ ok: true, redirect: "/employee/leave" })
    }
    case "AGREE_PROPOSAL": {
      await applyAgreeProposal(decoded.resourceId)
      await markTokenUsed(decoded, "AGREED")
      return NextResponse.json({ ok: true, redirect: "/employee/leave" })
    }
    case "DISAGREE_PROPOSAL": {
      if (!proposedStart || !proposedEnd || !message) {
        return NextResponse.json({ error: "COUNTER_PROPOSAL_FIELDS_REQUIRED" }, { status: 400 })
      }
      await applyDisagreeWithCounter(decoded.resourceId, decoded.userId, proposedStart, proposedEnd, message)
      await markTokenUsed(decoded, "DISAGREED")
      return NextResponse.json({ ok: true, redirect: "/employee/leave" })
    }
    default:
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 })
  }
}

// ---------------------------------------------------------------------------
// Helpers — these mirror the logic in the dedicated portal routes but
// skip session-auth because the signed token IS the credential.
// ---------------------------------------------------------------------------

// Terminal actions are the ones that move the request out of PENDING /
// NEGOTIATING for good. Non-terminal actions (SUPERSEDED, EXPIRED,
// SEND_FAILED) are bookkeeping markers and must NOT block fresh tokens —
// otherwise the reminder-email flow would get bricked the moment older
// events are marked SUPERSEDED.
const TERMINAL_ACTIONS = ["APPROVED", "REJECTED", "AGREED", "DISAGREED"] as const

async function isTokenUsed(decoded: ReturnType<typeof verifyToken>): Promise<boolean> {
  if (!decoded) return true

  // Determine the leave-request id this token ultimately points at.
  const leaveRequestId =
    decoded.resourceType === "LEAVE"
      ? decoded.resourceId
      : await leaveRequestIdForProposal(decoded.resourceId)
  if (!leaveRequestId) return true

  // Already-resolved? The leave request itself is the cheapest signal.
  // Once it's APPROVED / REJECTED / CANCELLED, no token should be honoured.
  const lr = await prisma.leaveRequest.findUnique({
    where: { id: leaveRequestId },
    select: { status: true },
  })
  if (!lr || !["PENDING", "NEGOTIATING"].includes(lr.status)) return true

  // For proposal tokens, the proposal must still be PENDING.
  if (decoded.resourceType === "PROPOSAL") {
    const p = await prisma.leaveProposal.findUnique({
      where: { id: decoded.resourceId },
      select: { status: true },
    })
    if (!p || p.status !== "PENDING") return true
  }

  // And: any prior terminal action recorded? (Defensive double-check.)
  const evt = await prisma.leaveEmailEvent.findFirst({
    where: {
      leaveRequestId,
      actionTaken: { in: [...TERMINAL_ACTIONS] },
    },
  })
  return !!evt
}

async function leaveRequestIdForProposal(proposalId: string): Promise<string | null> {
  const p = await prisma.leaveProposal.findUnique({ where: { id: proposalId }, select: { leaveRequestId: true } })
  return p?.leaveRequestId ?? null
}

async function markTokenUsed(decoded: NonNullable<ReturnType<typeof verifyToken>>, actionTaken: string) {
  const leaveRequestId =
    decoded.resourceType === "LEAVE"
      ? decoded.resourceId
      : await leaveRequestIdForProposal(decoded.resourceId)
  if (!leaveRequestId) return

  // Mark the most recent matching email event as consumed.
  const latest = await prisma.leaveEmailEvent.findFirst({
    where: { leaveRequestId, actionTaken: null },
    orderBy: { sentAt: "desc" },
  })
  if (latest) {
    await prisma.leaveEmailEvent.update({
      where: { id: latest.id },
      data: { tokenUsedAt: new Date(), actionTaken },
    })
  }
}

// Inline business logic — kept private to the token handler.

async function applyApproveLeave(id: string, supervisorNote?: string) {
  const lr = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      leaveType: { select: { name: true } },
      employee: { select: { id: true, name: true, email: true } },
      supervisor: { select: { id: true, name: true, email: true } },
      organization: { select: { name: true } },
    },
  })
  if (!lr || !["PENDING", "NEGOTIATING"].includes(lr.status)) return
  await prisma.leaveRequest.update({
    where: { id },
    data: { status: "APPROVED", supervisorNote: supervisorNote ?? null },
  })
  await prisma.leaveProposal.updateMany({
    where: { leaveRequestId: id, status: "PENDING" },
    data: { status: "SUPERSEDED" },
  })

  // Best-effort calendar push.
  const { CalendarService } = await import("@/lib/calendar/calendar-service")
  const { halfDayWindow } = await import("@/lib/calendar/ics")
  const isHalf = lr.isHalfDay && (lr.halfDayPeriod === "AM" || lr.halfDayPeriod === "PM")
  const evtStart = isHalf ? halfDayWindow(lr.startDate, lr.halfDayPeriod as "AM" | "PM").start : lr.startDate
  const evtEnd = isHalf
    ? halfDayWindow(lr.startDate, lr.halfDayPeriod as "AM" | "PM").end
    : new Date(Date.UTC(lr.endDate.getUTCFullYear(), lr.endDate.getUTCMonth(), lr.endDate.getUTCDate() + 1))
  const evtId = await CalendarService.createEventBestEffort(lr.employee.id, {
    uid: `leave-${lr.id}@flux.ai`,
    title: `${lr.leaveType.name}${isHalf ? ` (${lr.halfDayPeriod})` : ""}`,
    description: `${lr.totalDays} day(s) of ${lr.leaveType.name}`,
    start: evtStart,
    end: evtEnd,
    allDay: !isHalf,
  })
  if (evtId) {
    await prisma.leaveRequest.update({ where: { id }, data: { calEventEmployeeId: evtId } })
  }

  if (lr.employee.email) {
    const { sendLeaveEmail } = await import("@/lib/leave-email")
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
      supervisorNote: supervisorNote ?? null,
    })
  }
}

async function applyRejectLeave(id: string, rejectionReason: string) {
  const lr = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      leaveType: { select: { name: true } },
      employee: { select: { id: true, name: true, email: true } },
      supervisor: { select: { id: true, name: true, email: true } },
      organization: { select: { name: true } },
    },
  })
  if (!lr || !["PENDING", "NEGOTIATING"].includes(lr.status)) return
  await prisma.leaveRequest.update({
    where: { id },
    data: { status: "REJECTED", rejectionReason },
  })
  await prisma.leaveProposal.updateMany({
    where: { leaveRequestId: id, status: "PENDING" },
    data: { status: "SUPERSEDED" },
  })

  if (lr.employee.email && lr.supervisor.email) {
    const { sendLeaveEmail } = await import("@/lib/leave-email")
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
      rejectionReason,
    })
  }
}

async function applyAgreeProposal(proposalId: string) {
  const proposal = await prisma.leaveProposal.findUnique({
    where: { id: proposalId },
    include: {
      leaveRequest: {
        include: {
          leaveType: { select: { name: true } },
          employee: { select: { id: true, name: true, email: true } },
          supervisor: { select: { id: true, name: true, email: true } },
          organization: { select: { name: true } },
        },
      },
    },
  })
  if (!proposal || proposal.status !== "PENDING") return
  await prisma.leaveProposal.update({
    where: { id: proposalId },
    data: { status: "AGREED" },
  })
  await prisma.leaveRequest.update({
    where: { id: proposal.leaveRequestId },
    data: {
      status: "APPROVED",
      startDate: proposal.proposedStart,
      endDate: proposal.proposedEnd,
      totalDays: proposal.proposedDays,
    },
  })

  const lr = proposal.leaveRequest
  const { sendLeaveEmail } = await import("@/lib/leave-email")
  const ctx = {
    type: "PROPOSAL_AGREED" as const,
    leaveRequestId: lr.id,
    organizationName: lr.organization?.name,
    employeeName: lr.employee.name ?? "Employee",
    leaveTypeName: lr.leaveType.name,
    finalStart: proposal.proposedStart,
    finalEnd: proposal.proposedEnd,
    totalDays: proposal.proposedDays,
  }
  if (lr.employee.email) {
    await sendLeaveEmail({ ...ctx, to: { userId: lr.employee.id, email: lr.employee.email, name: lr.employee.name ?? undefined } })
  }
  if (lr.supervisor.email) {
    await sendLeaveEmail({ ...ctx, to: { userId: lr.supervisor.id, email: lr.supervisor.email, name: lr.supervisor.name ?? undefined } })
  }
}

async function applyDisagreeWithCounter(
  proposalId: string,
  userId: string,
  proposedStart: string,
  proposedEnd: string,
  message: string
) {
  const proposal = await prisma.leaveProposal.findUnique({
    where: { id: proposalId },
    include: { leaveRequest: { select: { id: true, employeeId: true, supervisorId: true } } },
  })
  if (!proposal || proposal.status !== "PENDING") return
  await prisma.leaveProposal.update({
    where: { id: proposalId },
    data: { status: "DISAGREED", responseNote: message },
  })

  // The dedicated /api/leave/request/[id]/proposal route requires a session,
  // so we inline the minimal counter-create here. The token IS the auth.
  const lr = await prisma.leaveRequest.findUnique({
    where: { id: proposal.leaveRequestId },
    include: {
      leaveType: { select: { name: true } },
      employee: { select: { id: true, name: true, email: true } },
      supervisor: { select: { id: true, name: true, email: true } },
      organization: { select: { name: true } },
    },
  })
  if (!lr) return
  const start = new Date(proposedStart)
  const end = new Date(proposedEnd)
  const holidays = await prisma.publicHoliday.findMany({
    where: { organizationId: lr.organizationId, date: { gte: start, lte: end } },
  })
  const { countWorkingDays } = await import("@/lib/leave-utils")
  const proposedDays = countWorkingDays(start, end, holidays)

  await prisma.leaveProposal.create({
    data: {
      leaveRequestId: lr.id,
      proposedById: userId,
      proposerRole: "EMPLOYEE",
      proposedStart: start,
      proposedEnd: end,
      proposedDays,
      message,
      status: "PENDING",
    },
  })

  const { generateLeaveActionTokens, sendLeaveEmail } = await import("@/lib/leave-email")
  const t = generateLeaveActionTokens(lr.id, lr.supervisorId)
  await prisma.leaveRequest.update({
    where: { id: lr.id },
    data: {
      approveToken: t.approveToken,
      rejectToken: t.rejectToken,
      tokenExpiresAt: t.tokenExpiresAt,
      status: "NEGOTIATING",
      negotiationRound: { increment: 1 },
    },
  })

  if (lr.supervisor.email) {
    await sendLeaveEmail({
      type: "EMPLOYEE_COUNTER",
      leaveRequestId: lr.id,
      to: { userId: lr.supervisor.id, email: lr.supervisor.email, name: lr.supervisor.name ?? undefined },
      replyTo: lr.employee.email ?? undefined,
      organizationName: lr.organization?.name,
      employeeName: lr.employee.name ?? "Employee",
      leaveTypeName: lr.leaveType.name,
      originalStart: lr.startDate,
      originalEnd: lr.endDate,
      supervisorProposedStart: proposal.proposedStart,
      supervisorProposedEnd: proposal.proposedEnd,
      employeeProposedStart: start,
      employeeProposedEnd: end,
      employeeProposedDays: proposedDays,
      message,
      approveToken: t.approveToken,
    })
  }
}
