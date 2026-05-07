import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Token-expiry sweeper.
// Runs daily. Finds LeaveEmailEvent rows whose underlying LeaveRequest /
// LeaveProposal has `tokenExpiresAt` in the past and that haven't been
// consumed yet — marks them EXPIRED so the admin audit log surfaces stale
// links and the supervisor knows to follow up via the portal.
//
// We also auto-time-out NEGOTIATING requests where the active proposal has
// sat unanswered for ≥5 days (per the negotiation deadlock rule confirmed
// in the spec). The proposal is marked EXPIRED and the request reverts to
// PENDING so the supervisor must Approve or Reject afresh.

const PROPOSAL_TIMEOUT_MS = 5 * 24 * 60 * 60 * 1000

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()

  // 1. Mark expired email events.
  const staleEvents = await prisma.leaveEmailEvent.findMany({
    where: {
      actionTaken: null,
      leaveRequest: { tokenExpiresAt: { lt: now } },
    },
    select: { id: true },
  })
  await prisma.leaveEmailEvent.updateMany({
    where: { id: { in: staleEvents.map((e) => e.id) } },
    data: { actionTaken: "EXPIRED" },
  })

  // 2. Time-out PENDING proposals that sat ≥5 days.
  const cutoff = new Date(Date.now() - PROPOSAL_TIMEOUT_MS)
  const stalledProposals = await prisma.leaveProposal.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    include: { leaveRequest: { select: { id: true, status: true, negotiationRound: true } } },
  })

  let revertedRequests = 0
  for (const p of stalledProposals) {
    await prisma.leaveProposal.update({
      where: { id: p.id },
      data: { status: "EXPIRED" },
    })
    if (p.leaveRequest.status === "NEGOTIATING") {
      // No active proposal anymore → revert to PENDING for supervisor to act.
      await prisma.leaveRequest.update({
        where: { id: p.leaveRequest.id },
        data: { status: "PENDING" },
      })
      revertedRequests++
    }
  }

  return NextResponse.json({
    expiredEmailEvents: staleEvents.length,
    expiredProposals: stalledProposals.length,
    revertedRequests,
  })
}
