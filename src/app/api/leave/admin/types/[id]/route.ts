import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// PATCH /api/leave/admin/types/[id] — admin updates editable fields on a leave type.
// DELETE /api/leave/admin/types/[id] — admin deletes a leave type, but only
// when no LeaveRequest references it. Otherwise returns 409 with a message.

const Patch = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  maxDaysPerYear: z.number().int().min(0).max(366).nullable().optional(),
  requiresApproval: z.boolean().optional(),
  isPaid: z.boolean().optional(),
})

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

async function authoriseScoped(id: string) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return { ok: false as const, status: 403 }
  }
  const lt = await prisma.leaveType.findUnique({ where: { id } })
  if (!lt) return { ok: false as const, status: 404 }
  if (session.user.role === "ADMIN" && lt.organizationId !== session.user.organizationId) {
    return { ok: false as const, status: 403 }
  }
  return { ok: true as const, leaveType: lt }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth_ = await authoriseScoped(id)
  if (!auth_.ok) return NextResponse.json({ error: auth_.status === 404 ? "Not found" : "Forbidden" }, { status: auth_.status })

  const parsed = Patch.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })

  const updated = await prisma.leaveType.update({ where: { id }, data: parsed.data })
  return NextResponse.json({ leaveType: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth_ = await authoriseScoped(id)
  if (!auth_.ok) return NextResponse.json({ error: auth_.status === 404 ? "Not found" : "Forbidden" }, { status: auth_.status })

  // Refuse if any leave request still references this type — protect the
  // historical data.
  const inUse = await prisma.leaveRequest.count({ where: { leaveTypeId: id } })
  if (inUse > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${inUse} leave request(s) still reference this type.` },
      { status: 409 }
    )
  }
  await prisma.leaveType.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
