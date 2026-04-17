import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getConfig } from "@/lib/config"
import { sendNotification } from "@/lib/notifications"

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const day = result.getDay()
    if (day !== 0 && day !== 6) {
      added++
    }
  }
  return result
}

export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret")
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const approvalDeadlineConfig = await getConfig(prisma, "approvalDeadline")
  const deadlineBusinessDays =
    (approvalDeadlineConfig as { businessDays?: number } | null)?.businessDays ?? 3

  const pendingSteps = await prisma.approvalStep.findMany({
    where: { status: "PENDING" },
    include: {
      request: { select: { id: true, title: true, submittedAt: true, createdAt: true } },
    },
  })

  const now = new Date()
  let escalationCount = 0

  for (const step of pendingSteps) {
    const submittedAt = step.request.submittedAt ?? step.request.createdAt
    const deadline = addBusinessDays(submittedAt, deadlineBusinessDays)

    if (deadline <= now) {
      await sendNotification({
        userId: step.approverId,
        requestId: step.requestId,
        type: "APPROVAL_OVERDUE",
        message: `Overdue: request "${step.request.title}" needs your review.`,
      })
      escalationCount++
    }
  }

  return NextResponse.json({ escalationsSent: escalationCount })
}
