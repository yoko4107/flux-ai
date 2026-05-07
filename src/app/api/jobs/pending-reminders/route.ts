import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendLeaveEmail, generateLeaveActionTokens } from "@/lib/leave-email"

// Pending-approval reminder.
// Runs every 6 hours. Finds leave requests still PENDING for >48h that haven't
// had a reminder in the last 24h. Generates fresh tokens (so old expired
// emails are rendered useless) and resends the request email to the supervisor.

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000
const REMINDER_THROTTLE_MS = 24 * 60 * 60 * 1000

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS)
  const throttleCutoff = new Date(Date.now() - REMINDER_THROTTLE_MS)

  const stale = await prisma.leaveRequest.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    include: {
      leaveType: { select: { name: true } },
      employee: { select: { id: true, name: true, email: true } },
      supervisor: { select: { id: true, name: true, email: true } },
      organization: { select: { name: true } },
      emailEvents: {
        where: { emailType: "REMINDER_PENDING", sentAt: { gt: throttleCutoff } },
        select: { id: true },
      },
    },
  })

  let sent = 0
  for (const r of stale) {
    if (r.emailEvents.length > 0) continue // recently reminded
    if (!r.supervisor.email) continue

    const t = generateLeaveActionTokens(r.id, r.supervisorId)
    await prisma.leaveRequest.update({
      where: { id: r.id },
      data: {
        approveToken: t.approveToken,
        rejectToken: t.rejectToken,
        tokenExpiresAt: t.tokenExpiresAt,
      },
    })

    // Mark older email events as superseded so the audit trail is clean.
    await prisma.leaveEmailEvent.updateMany({
      where: { leaveRequestId: r.id, actionTaken: null },
      data: { actionTaken: "SUPERSEDED" },
    })

    const daysWaiting = Math.max(1, Math.floor((Date.now() - r.createdAt.getTime()) / (24 * 60 * 60 * 1000)))
    await sendLeaveEmail({
      type: "REMINDER_PENDING",
      leaveRequestId: r.id,
      to: { userId: r.supervisor.id, email: r.supervisor.email, name: r.supervisor.name ?? undefined },
      replyTo: r.employee.email ?? undefined,
      organizationName: r.organization?.name,
      employeeName: r.employee.name ?? r.employee.email ?? "Employee",
      leaveTypeName: r.leaveType.name,
      startDate: r.startDate,
      endDate: r.endDate,
      totalDays: r.totalDays,
      reason: r.reason ?? null,
      approveToken: t.approveToken,
      rejectToken: t.rejectToken,
      daysWaiting,
    })

    sent++
  }

  return NextResponse.json({ scanned: stale.length, sent })
}
