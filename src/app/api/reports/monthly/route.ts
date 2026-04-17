import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.role !== "FINANCE" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const month = searchParams.get("month")

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month format. Use YYYY-MM" }, { status: 400 })
  }

  const requests = await prisma.reimbursementRequest.findMany({
    where: {
      status: { in: ["APPROVED", "PAID"] },
      month,
    },
    include: {
      employee: { select: { id: true, name: true, email: true, department: true } },
      approvalSteps: {
        orderBy: { order: "asc" },
      },
      auditLogs: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { submittedAt: "asc" },
  })

  const reportData = requests.map((req) => {
    // Find latest APPROVED step decidedAt
    const approvedSteps = req.approvalSteps.filter((s) => s.status === "APPROVED")
    const approvedAt =
      approvedSteps.length > 0
        ? approvedSteps.reduce((latest, step) =>
            step.decidedAt && (!latest.decidedAt || step.decidedAt > latest.decidedAt)
              ? step
              : latest
          ).decidedAt
        : null

    // Find paidAt from audit log
    const paidLog = req.auditLogs.find((l) => l.action === "REQUEST_PAID")
    const paidAt = paidLog?.createdAt ?? null

    return {
      requestId: req.id,
      employeeName: req.employee.name ?? req.employee.email ?? "Unknown",
      department: req.employee.department ?? "—",
      category: req.category,
      amount: Number(req.amount),
      amountIDR: req.amountIDR ? Number(req.amountIDR) : null,
      currency: req.currency,
      receiptUrl: req.receiptUrl,
      submittedAt: req.submittedAt,
      approvedAt,
      paidAt,
      status: req.status,
      title: req.title,
    }
  })

  // Compute totals by category
  const totalsByCategory: Record<string, number> = {}
  const totalsByCategoryIDR: Record<string, number> = {}
  let grandTotal = 0
  let grandTotalIDR = 0
  for (const row of reportData) {
    totalsByCategory[row.category] = (totalsByCategory[row.category] ?? 0) + row.amount
    grandTotal += row.amount
    const idr = row.amountIDR ?? 0
    totalsByCategoryIDR[row.category] = (totalsByCategoryIDR[row.category] ?? 0) + idr
    grandTotalIDR += idr
  }

  return NextResponse.json({ data: reportData, totalsByCategory, totalsByCategoryIDR, grandTotal, grandTotalIDR, month })
}
