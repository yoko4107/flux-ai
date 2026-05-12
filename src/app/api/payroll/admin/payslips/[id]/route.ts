import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// PATCH /api/payroll/admin/payslips/[id]
//   { action: "FINALIZE" }    Draft → Finalized. Locks the payslip.
//   { action: "MARK_PAID", paidAt? }   Finalized → Paid.
//   { action: "REOPEN" }      Finalized → Draft. Super-admin only.
// DELETE                       — only when status = DRAFT.

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("FINALIZE") }),
  z.object({ action: z.literal("MARK_PAID"), paidAt: z.string().datetime({ offset: true }).optional() }),
  z.object({ action: z.literal("REOPEN") }),
])

// Inline the session lookup — `Awaited<ReturnType<typeof auth>>` trips
// a TS overload conflict with next-auth's NextMiddleware overload.
async function loadAndAuthorize(id: string) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return { error: "Forbidden" as const, status: 403 as const }
  }
  const payslip = await prisma.payslip.findUnique({ where: { id } })
  if (!payslip) return { error: "Not found" as const, status: 404 as const }
  if (session.user.role === "ADMIN" && payslip.organizationId !== session.user.organizationId) {
    return { error: "Forbidden" as const, status: 403 as const }
  }
  return { payslip, role: session.user.role }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth_ = await loadAndAuthorize(id)
  if ("error" in auth_) return NextResponse.json({ error: auth_.error }, { status: auth_.status })
  const { payslip, role } = auth_

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  const action = parsed.data

  if (action.action === "FINALIZE") {
    if (payslip.status !== "DRAFT") return NextResponse.json({ error: `Cannot finalize a ${payslip.status} payslip` }, { status: 400 })
    const updated = await prisma.payslip.update({
      where: { id },
      data: { status: "FINALIZED", finalizedAt: new Date() },
    })
    return NextResponse.json({ payslip: updated })
  }

  if (action.action === "MARK_PAID") {
    if (payslip.status !== "FINALIZED") return NextResponse.json({ error: `Only FINALIZED payslips can be marked paid (current: ${payslip.status})` }, { status: 400 })
    const updated = await prisma.payslip.update({
      where: { id },
      data: { status: "PAID", paidAt: action.paidAt ? new Date(action.paidAt) : new Date() },
    })
    return NextResponse.json({ payslip: updated })
  }

  // REOPEN — super-admin only as it changes finalised history.
  if (role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only SUPER_ADMIN can reopen a finalized payslip" }, { status: 403 })
  }
  if (payslip.status === "DRAFT") return NextResponse.json({ error: "Already a draft" }, { status: 400 })
  const updated = await prisma.payslip.update({
    where: { id },
    data: { status: "DRAFT", finalizedAt: null, paidAt: null },
  })
  return NextResponse.json({ payslip: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth_ = await loadAndAuthorize(id)
  if ("error" in auth_) return NextResponse.json({ error: auth_.error }, { status: auth_.status })
  const { payslip } = auth_

  if (payslip.status !== "DRAFT") {
    return NextResponse.json({ error: `Cannot delete a ${payslip.status} payslip` }, { status: 400 })
  }
  await prisma.payslip.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
