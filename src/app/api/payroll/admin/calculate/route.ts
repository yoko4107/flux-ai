import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generatePayslipDraft } from "@/lib/payroll-server"
import { fromMinor } from "@/lib/payroll"

// POST /api/payroll/admin/calculate
//   Body: { employeeId, period (YYYY-MM), workingDays?, paidDays? }
//
// Preview a payslip without persisting. Returns the engine's draft with
// every amount converted back to major units (decimal) so the UI can
// render it directly.

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

const Body = z.object({
  employeeId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  workingDays: z.number().int().min(1).max(31).optional(),
  paidDays: z.number().int().min(0).max(31).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })

  // Org-scope guard.
  const employee = await prisma.user.findUnique({
    where: { id: parsed.data.employeeId },
    select: { organizationId: true },
  })
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 })
  if (session.user.role === "ADMIN" && employee.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { draft, countryCode, currency } = await generatePayslipDraft(
      parsed.data.employeeId,
      parsed.data.period,
      { workingDays: parsed.data.workingDays, paidDays: parsed.data.paidDays }
    )
    return NextResponse.json({
      preview: {
        countryCode,
        currency,
        workingDays: draft.workingDays,
        paidDays: draft.paidDays,
        grossPay: fromMinor(draft.grossPay),
        taxableIncome: fromMinor(draft.taxableIncome),
        totalDeductions: fromMinor(draft.totalDeductions),
        netPay: fromMinor(draft.netPay),
        employerCost: fromMinor(draft.employerCost),
        lines: draft.lines.map((l) => ({ ...l, amount: fromMinor(l.amount) })),
        warnings: draft.warnings,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Calculation failed"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
