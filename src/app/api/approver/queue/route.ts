import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getConfig } from "@/lib/config"

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

function businessDaysRemaining(deadline: Date): number {
  const now = new Date()
  if (deadline <= now) return 0

  let days = 0
  const cur = new Date(now)
  while (cur < deadline) {
    cur.setDate(cur.getDate() + 1)
    const day = cur.getDay()
    if (day !== 0 && day !== 6) {
      days++
    }
  }
  return days
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.role !== "APPROVER" && session.user.role !== "FINANCE" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const steps = await prisma.approvalStep.findMany({
    where: { approverId: session.user.id, status: "PENDING" },
    include: {
      request: {
        include: {
          employee: { select: { id: true, name: true, email: true, department: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  })

  const approvalDeadlineConfig = await getConfig(prisma, "approvalDeadline")
  const deadlineBusinessDays =
    (approvalDeadlineConfig as { businessDays?: number } | null)?.businessDays ?? 3

  const items = steps.map((step) => {
    const submittedAt = step.request.submittedAt ?? step.request.createdAt
    const deadline = addBusinessDays(submittedAt, deadlineBusinessDays)
    const now = new Date()
    const isOverdue = deadline <= now
    const daysRemaining = isOverdue
      ? -Math.ceil((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24))
      : businessDaysRemaining(deadline)

    return {
      step,
      request: step.request,
      employee: step.request.employee,
      daysRemaining,
    }
  })

  // Sort by daysRemaining ascending (most urgent first)
  items.sort((a, b) => a.daysRemaining - b.daysRemaining)

  return NextResponse.json(items)
}
