import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { sendNotification } from "@/lib/notifications"
import { getConfig } from "@/lib/config"

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Check if today is the deadline day
  const deadlineConfig = await getConfig(prisma, "submissionDeadline") as { day?: number } | null
  const deadlineDay = deadlineConfig?.day ?? 20
  const now = new Date()

  if (now.getDate() !== deadlineDay) {
    return NextResponse.json({ message: "Not deadline day", today: now.getDate(), deadlineDay })
  }

  // Find the current month string
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  // Find all DRAFT requests for the current month (or with no month set)
  const drafts = await prisma.reimbursementRequest.findMany({
    where: {
      status: "DRAFT",
      OR: [
        { month: currentMonth },
        { month: null },
      ],
    },
    include: {
      employee: { select: { id: true, name: true, email: true, organizationId: true } },
    },
  })

  if (drafts.length === 0) {
    return NextResponse.json({ message: "No drafts to auto-submit", month: currentMonth })
  }

  let submitted = 0
  let skipped = 0
  const errors: string[] = []
  const firstApproversToNotify = new Set<string>()

  for (const draft of drafts) {
    try {
      // Validate: amount must be > 0
      if (Number(draft.amount) <= 0) {
        skipped++
        errors.push(`${draft.title}: amount is 0, skipped`)
        continue
      }

      // Resolve org-scoped committee with fallback to global
      const committeeValue = (await getConfig(prisma, "approvalCommittee", draft.employee.organizationId)) as {
        members?: Array<{ userId: string; order: number }>
      } | null
      const members = committeeValue?.members ?? []

      // Update status to SUBMITTED
      await prisma.reimbursementRequest.update({
        where: { id: draft.id },
        data: {
          status: "SUBMITTED",
          submittedAt: now,
          month: draft.month || currentMonth,
        },
      })

      // Create approval steps
      if (members.length > 0) {
        const stepData = members
          .sort((a, b) => a.order - b.order)
          .map((m) => ({
            requestId: draft.id,
            approverId: m.userId,
            order: m.order,
          }))
        await prisma.approvalStep.createMany({ data: stepData })
        const first = members.slice().sort((a, b) => a.order - b.order)[0]
        if (first) firstApproversToNotify.add(first.userId)
      }

      // Audit log
      await writeAuditLog(prisma, {
        requestId: draft.id,
        actorId: draft.employeeId,
        action: "REQUEST_AUTO_SUBMITTED",
        details: {
          previousStatus: "DRAFT",
          month: draft.month || currentMonth,
          reason: `Auto-submitted on deadline day (${deadlineDay}th at 6pm)`,
        },
      })

      // Notify the employee
      await sendNotification({
        userId: draft.employeeId,
        requestId: draft.id,
        type: "AUTO_SUBMITTED",
        message: `Your draft "${draft.title}" has been automatically submitted on the deadline.`,
      })

      submitted++
    } catch (err) {
      skipped++
      errors.push(`${draft.title}: ${String(err)}`)
    }
  }

  // Notify first approvers about new items
  if (submitted > 0) {
    for (const userId of firstApproversToNotify) {
      await sendNotification({
        userId,
        type: "AUTO_SUBMIT_BATCH",
        message: `${submitted} reimbursement requests were auto-submitted and are awaiting your review.`,
      })
    }
  }

  return NextResponse.json({
    message: `Auto-submit complete`,
    month: currentMonth,
    total: drafts.length,
    submitted,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  })
}
