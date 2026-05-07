import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendLeaveEmail } from "@/lib/leave-email"
import { utcDateOnly } from "@/lib/leave-utils"

// PATCH /api/leave/proposal/[id]
//   { action: "AGREE", responseNote?: string }       (other party accepts)
//   { action: "DISAGREE", responseNote: string ≥20 } (counter-proposal NOT in this route — caller posts to /request/[id]/proposal next)

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("AGREE"), responseNote: z.string().max(2000).optional() }),
  z.object({ action: z.literal("DISAGREE"), responseNote: z.string().min(20).max(2000) }),
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

  const proposal = await prisma.leaveProposal.findUnique({
    where: { id },
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
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (proposal.status !== "PENDING") {
    return NextResponse.json({ error: `Proposal is ${proposal.status}, no further action allowed` }, { status: 400 })
  }

  // Authorization: the PARTY OPPOSITE to the proposer can act.
  const isEmployee = session.user.id === proposal.leaveRequest.employeeId
  const isSupervisor = session.user.id === proposal.leaveRequest.supervisorId
  const opposite =
    proposal.proposerRole === "SUPERVISOR" ? isEmployee :
    proposal.proposerRole === "EMPLOYEE"   ? isSupervisor : false
  if (!opposite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (action.action === "AGREE") {
    // Adopt the proposed dates and approve the leave request.
    await prisma.leaveProposal.update({
      where: { id },
      data: { status: "AGREED", responseNote: action.responseNote ?? null },
    })
    const updated = await prisma.leaveRequest.update({
      where: { id: proposal.leaveRequestId },
      data: {
        status: "APPROVED",
        startDate: utcDateOnly(proposal.proposedStart),
        endDate: utcDateOnly(proposal.proposedEnd),
        totalDays: proposal.proposedDays,
      },
    })

    // Notify both parties.
    const lr = proposal.leaveRequest
    const baseCtx = {
      leaveRequestId: lr.id,
      organizationName: lr.organization?.name,
      employeeName: lr.employee.name ?? "Employee",
      leaveTypeName: lr.leaveType.name,
      finalStart: proposal.proposedStart,
      finalEnd: proposal.proposedEnd,
      totalDays: proposal.proposedDays,
    } as const
    if (lr.employee.email) {
      await sendLeaveEmail({
        ...baseCtx,
        type: "PROPOSAL_AGREED",
        to: { userId: lr.employee.id, email: lr.employee.email, name: lr.employee.name ?? undefined },
      })
    }
    if (lr.supervisor.email) {
      await sendLeaveEmail({
        ...baseCtx,
        type: "PROPOSAL_AGREED",
        to: { userId: lr.supervisor.id, email: lr.supervisor.email, name: lr.supervisor.name ?? undefined },
      })
    }

    return NextResponse.json({ proposal: { ...proposal, status: "AGREED" }, leaveRequest: updated })
  }

  // DISAGREE — mark the proposal disagreed; client should post a new
  // counter-proposal via /api/leave/request/[id]/proposal if they have one.
  await prisma.leaveProposal.update({
    where: { id },
    data: { status: "DISAGREED", responseNote: action.responseNote },
  })

  return NextResponse.json({ status: "DISAGREED", message: "Submit a counter-proposal next, or the supervisor may approve/reject directly." })
}
