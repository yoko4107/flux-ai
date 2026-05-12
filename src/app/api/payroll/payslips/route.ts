import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/payroll/payslips
//   Employee: their own FINALIZED + PAID payslips (no drafts).
//   Year filter: ?year=2026 — used by the YTD totals widget.
//
// Drafts are admin-only — once finalised, an employee can view them.

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const year = url.searchParams.get("year")

  const where: Record<string, unknown> = {
    employeeId: session.user.id,
    status: { in: ["FINALIZED", "PAID"] },
  }
  if (year && /^\d{4}$/.test(year)) where.period = { startsWith: `${year}-` }

  const payslips = await prisma.payslip.findMany({
    where,
    orderBy: { period: "desc" },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  })

  // YTD aggregates for the panel header. Recomputed server-side so the
  // client doesn't have to.
  const ytd = payslips.reduce(
    (acc, p) => {
      acc.grossPay += Number(p.grossPay.toString())
      acc.totalDeductions += Number(p.totalDeductions.toString())
      acc.netPay += Number(p.netPay.toString())
      return acc
    },
    { grossPay: 0, totalDeductions: 0, netPay: 0 }
  )

  return NextResponse.json({ payslips, ytd, year: year ?? null })
}
