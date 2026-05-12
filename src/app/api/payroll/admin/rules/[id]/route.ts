import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

// DELETE /api/payroll/admin/rules/[id] — remove a country rule (and its brackets).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  const rule = await prisma.countryPayrollRule.findUnique({ where: { id } })
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (session.user.role === "ADMIN" && rule.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  await prisma.countryPayrollRule.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
