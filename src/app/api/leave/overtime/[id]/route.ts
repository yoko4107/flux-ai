import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// PATCH /api/leave/overtime/[id]
//   { action: "REJECT", reason: string ≥10 } — admin / supervisor reverses an OT entry.
// DELETE — admin only, hard delete.

const Body = z.object({
  action: z.literal("REJECT"),
  reason: z.string().min(10).max(2000),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["APPROVER", "ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 })

  const ot = await prisma.overtimeRecord.findUnique({ where: { id } })
  if (!ot) return NextResponse.json({ error: "Not found" }, { status: 404 })
  // Supervisors can only modify their own entries.
  if (session.user.role === "APPROVER" && ot.supervisorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const updated = await prisma.overtimeRecord.update({
    where: { id },
    data: { status: "REJECTED", notes: parsed.data.reason },
  })
  return NextResponse.json({ record: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  const ot = await prisma.overtimeRecord.findUnique({ where: { id } })
  if (!ot) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (session.user.role === "ADMIN" && ot.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  await prisma.overtimeRecord.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
