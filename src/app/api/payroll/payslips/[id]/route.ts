import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/payroll/payslips/[id]
// Employee: their own (FINALIZED + PAID only — DRAFT is admin-only)
// Admin / SuperAdmin: any payslip in their org

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const payslip = await prisma.payslip.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, name: true, email: true } },
      lines: { orderBy: { sortOrder: "asc" } },
    },
  })
  if (!payslip) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const role = session.user.role
  const isOwner = payslip.employeeId === session.user.id
  const isOrgAdmin = role === "ADMIN" && payslip.organizationId === session.user.organizationId
  const isSuperAdmin = role === "SUPER_ADMIN"

  if (!isOrgAdmin && !isSuperAdmin) {
    // Employee can only see their own, and only once finalised.
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (payslip.status === "DRAFT") return NextResponse.json({ error: "Payslip not yet released" }, { status: 403 })
  }

  return NextResponse.json({ payslip })
}
