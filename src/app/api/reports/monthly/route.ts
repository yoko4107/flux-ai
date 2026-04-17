import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgBaseCurrency } from "@/lib/org-currency"

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

  // Scope report to requests from the user's organization. FINANCE and ADMIN
  // are both organization-scoped. Falling back to "__none__" returns zero rows.
  const orgId = session.user.organizationId ?? "__none__"
  const baseCurrency = await getOrgBaseCurrency(session.user.organizationId)

  const requests = await prisma.reimbursementRequest.findMany({
    where: {
      status: { in: ["APPROVED", "PAID"] },
      month,
      employee: { organizationId: orgId },
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
      currency: req.currency,
      amountBase: req.amountIDR ? Number(req.amountIDR) : null,
      exchangeRate: req.exchangeRate ? Number(req.exchangeRate) : null,
      receiptUrl: req.receiptUrl,
      submittedAt: req.submittedAt,
      approvedAt,
      paidAt,
      status: req.status,
      title: req.title,
    }
  })

  // Totals are computed against the organization's base currency so cross-
  // currency requests sum correctly.
  const totalsByCategory: Record<string, number> = {}
  const totalsByCategoryBase: Record<string, number> = {}
  let grandTotal = 0
  let grandTotalBase = 0
  for (const row of reportData) {
    totalsByCategory[row.category] = (totalsByCategory[row.category] ?? 0) + row.amount
    grandTotal += row.amount
    const base = row.amountBase ?? 0
    totalsByCategoryBase[row.category] = (totalsByCategoryBase[row.category] ?? 0) + base
    grandTotalBase += base
  }

  return NextResponse.json({
    data: reportData,
    totalsByCategory,
    totalsByCategoryBase,
    // Keep legacy keys for any consumers still reading them.
    totalsByCategoryIDR: totalsByCategoryBase,
    grandTotal,
    grandTotalBase,
    grandTotalIDR: grandTotalBase,
    month,
    baseCurrency,
  })
}
