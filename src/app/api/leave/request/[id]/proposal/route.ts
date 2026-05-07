import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { countWorkingDays, utcDateOnly } from "@/lib/leave-utils"
import {
  sendLeaveEmail,
  generateProposalActionTokens,
  generateLeaveActionTokens,
} from "@/lib/leave-email"

// POST /api/leave/request/[id]/proposal
// Either party (supervisor or employee) submits a counter-proposal of new
// dates. Marks any prior PENDING proposals as SUPERSEDED, sets the leave
// request to NEGOTIATING, generates the appropriate email tokens, and
// notifies the OTHER party.
//
// Hard cap: max 3 round-trips (negotiationRound). Once exceeded, the
// supervisor must Approve or Reject — no further proposals accepted.

const MAX_ROUNDS = 3

const Body = z.object({
  proposedStart: z.string(),
  proposedEnd: z.string(),
  message: z.string().min(20, "Message must be at least 20 characters").max(2000),
})

export async function POST(
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
  const { proposedStart, proposedEnd, message } = parsed.data

  const lr = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      leaveType: { select: { name: true } },
      employee: { select: { id: true, name: true, email: true } },
      supervisor: { select: { id: true, name: true, email: true } },
      organization: { select: { name: true } },
    },
  })
  if (!lr) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (!["PENDING", "NEGOTIATING"].includes(lr.status)) {
    return NextResponse.json({ error: `Cannot propose against a ${lr.status} request` }, { status: 400 })
  }
  if (lr.negotiationRound >= MAX_ROUNDS) {
    return NextResponse.json(
      { error: `Maximum negotiation rounds reached (${MAX_ROUNDS}). Supervisor must Approve or Reject.` },
      { status: 400 }
    )
  }

  const proposerRole =
    session.user.id === lr.supervisorId
      ? "SUPERVISOR"
      : session.user.id === lr.employeeId
        ? "EMPLOYEE"
        : null
  if (!proposerRole) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const start = utcDateOnly(proposedStart)
  const end = utcDateOnly(proposedEnd)
  if (end < start) return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 })

  const holidays = await prisma.publicHoliday.findMany({
    where: { organizationId: lr.organizationId, date: { gte: start, lte: end } },
  })
  const proposedDays = countWorkingDays(start, end, holidays)
  if (proposedDays <= 0) {
    return NextResponse.json({ error: "Proposed range contains no working days" }, { status: 400 })
  }

  // Mark any prior pending proposal as SUPERSEDED.
  await prisma.leaveProposal.updateMany({
    where: { leaveRequestId: id, status: "PENDING" },
    data: { status: "SUPERSEDED" },
  })

  // Create the new proposal first (without tokens) so we have its id.
  const proposal = await prisma.leaveProposal.create({
    data: {
      leaveRequestId: id,
      proposedById: session.user.id,
      proposerRole,
      proposedStart: start,
      proposedEnd: end,
      proposedDays,
      message,
      status: "PENDING",
    },
  })

  // Tokens differ based on who needs to act next:
  //   SUPERVISOR proposed → employee gets agree/disagree tokens
  //   EMPLOYEE proposed → supervisor gets approve/reject tokens (treats counter as a fresh request)
  const recipient = proposerRole === "SUPERVISOR" ? lr.employee : lr.supervisor

  let tokensForEmail: { agree?: string; disagree?: string; approve?: string; reject?: string } = {}
  if (proposerRole === "SUPERVISOR") {
    const t = generateProposalActionTokens(proposal.id, recipient.id)
    await prisma.leaveProposal.update({
      where: { id: proposal.id },
      data: {
        agreeToken: t.agreeToken,
        disagreeToken: t.disagreeToken,
        tokenExpiresAt: t.tokenExpiresAt,
      },
    })
    tokensForEmail = { agree: t.agreeToken, disagree: t.disagreeToken }
  } else {
    // Employee counter — supervisor can approve directly. Re-issue
    // approve/reject tokens on the LeaveRequest so old emails are useless.
    const t = generateLeaveActionTokens(id, lr.supervisorId)
    await prisma.leaveRequest.update({
      where: { id },
      data: {
        approveToken: t.approveToken,
        rejectToken: t.rejectToken,
        tokenExpiresAt: t.tokenExpiresAt,
      },
    })
    tokensForEmail = { approve: t.approveToken, reject: t.rejectToken }
  }

  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: {
      status: "NEGOTIATING",
      negotiationRound: { increment: 1 },
    },
  })

  // Email the OTHER party.
  if (recipient.email) {
    if (proposerRole === "SUPERVISOR" && tokensForEmail.agree && tokensForEmail.disagree) {
      await sendLeaveEmail({
        type: "SUPERVISOR_PROPOSAL",
        leaveRequestId: id,
        to: { userId: recipient.id, email: recipient.email, name: recipient.name ?? undefined },
        replyTo: lr.supervisor.email ?? undefined,
        organizationName: lr.organization?.name,
        supervisorName: lr.supervisor.name ?? "Supervisor",
        leaveTypeName: lr.leaveType.name,
        originalStart: lr.startDate,
        originalEnd: lr.endDate,
        originalDays: lr.totalDays,
        proposedStart: start,
        proposedEnd: end,
        proposedDays,
        message,
        agreeToken: tokensForEmail.agree,
        disagreeToken: tokensForEmail.disagree,
      })
    } else if (proposerRole === "EMPLOYEE" && tokensForEmail.approve) {
      // Find the most-recent SUPERSEDED proposal to show what the supervisor previously proposed.
      const prevSup = await prisma.leaveProposal.findFirst({
        where: { leaveRequestId: id, proposerRole: "SUPERVISOR" },
        orderBy: { createdAt: "desc" },
      })
      await sendLeaveEmail({
        type: "EMPLOYEE_COUNTER",
        leaveRequestId: id,
        to: { userId: recipient.id, email: recipient.email, name: recipient.name ?? undefined },
        replyTo: lr.employee.email ?? undefined,
        organizationName: lr.organization?.name,
        employeeName: lr.employee.name ?? "Employee",
        leaveTypeName: lr.leaveType.name,
        originalStart: lr.startDate,
        originalEnd: lr.endDate,
        supervisorProposedStart: prevSup?.proposedStart ?? lr.startDate,
        supervisorProposedEnd: prevSup?.proposedEnd ?? lr.endDate,
        employeeProposedStart: start,
        employeeProposedEnd: end,
        employeeProposedDays: proposedDays,
        message,
        approveToken: tokensForEmail.approve,
      })
    }
  }

  return NextResponse.json({ leaveRequest: updated, proposal }, { status: 201 })
}
